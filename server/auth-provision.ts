/**
 * Auto-provisioning of UserRole rows in the unified app DB.
 *
 * Shared across every app of the ecosystem (notaria, legifirma, archivo,
 * cancelaciones, …) so that SSO inter-app navigation never lands on a
 * page that requires `creadoPorId` without a UserRole row available.
 *
 * **Contract:** when a user authenticates via shared cookie (no local
 * /api/auth/login pass), the app's `getAuthContext` must call this
 * helper to materialize a UserRole row in the local Prisma view of the
 * unified DB.
 *
 * Idempotent via upsert. Logs (and swallows) the FK constraint error
 * that fires when the local Organization row hasn't been created yet —
 * the first /api/auth/login call in any app of the ecosystem is what
 * materializes the Organization row, and subsequent SSO works thereafter.
 *
 * **Type strategy:** receives `userRoleDelegate` and `role` as opaque
 * generics so each app keeps its own Prisma client and AppRole enum
 * without forcing a single shared type. The delegate's structural
 * signature matches what every Prisma client generates for `userRole`.
 */

export interface UserRoleAuthOrgKey {
  authUserId_orgId: { authUserId: string; orgId: string };
}

export interface UserRoleRow<TRole extends string> {
  id: string;
  authUserId: string;
  orgId: string;
  role: TRole;
  active: boolean;
}

export interface UserRoleDelegate<TRole extends string> {
  findUnique(args: {
    where: UserRoleAuthOrgKey;
  }): Promise<UserRoleRow<TRole> | null>;
  findFirst(args: {
    where: { authUserId: string; active?: boolean };
  }): Promise<UserRoleRow<TRole> | null>;
  upsert(args: {
    where: UserRoleAuthOrgKey;
    update: Record<string, unknown>;
    create: {
      authUserId: string;
      orgId: string;
      role: TRole;
      displayName: string;
      email: string;
      active: boolean;
    };
  }): Promise<UserRoleRow<TRole>>;
}

export interface ProvisionUserRoleArgs<TRole extends string> {
  /** Prisma userRole delegate, e.g. `prisma.userRole`. */
  userRoleDelegate: UserRoleDelegate<TRole>;
  /** `sub` of the JWT (auth service user id). */
  authUserId: string;
  /** `orgId` claim of the JWT. */
  orgId: string;
  /** `email` claim of the JWT — used as `displayName` and `email`. */
  email: string;
  /**
   * Default app role to use when creating a new UserRole. Each app maps
   * its own JWT.authRole to its enum (e.g. `'superadmin' → 'NOTARIO'`).
   */
  defaultRole: TRole;
  /**
   * If centralized permissions service returned an `appRoleKey` that's a
   * valid value of the app's role enum, pass it here to override
   * `defaultRole`. Otherwise leave undefined and `defaultRole` is used.
   */
  centralizedRole?: TRole | null;
  /**
   * The app's valid local role enum values (e.g. `Object.values(MyRole)`).
   * When provided, a `centralizedRole` that is NOT one of these is ignored
   * and `defaultRole` is used instead — this guards against drift between
   * the global B2B role catalog (#78) and a given app's narrower Prisma
   * enum, which would otherwise make the create throw and kick the user to
   * login. Even when omitted, the create degrades to `defaultRole` on
   * failure (see below), so this is a proactive optimization, not required.
   */
  validRoles?: readonly TRole[];
  /**
   * Optional logger override. When omitted, falls back to `console.warn`
   * for FK violations. Intentional: never throw.
   */
  onError?: (err: unknown) => void;
}

/**
 * Returns the local UserRole for the authenticated user, creating it on
 * the fly when missing. Falls back to `findFirst` for the superadmin
 * case (JWT.orgId = '_system' but UserRole exists in another org).
 *
 * Returns `null` only when the upsert fails (Organization not present
 * yet). Callers should treat this as "session not yet provisioned" and
 * either route the user through the local /api/auth/login (which upserts
 * the Organization) or surface a friendly retry message.
 */
export async function provisionUserRole<TRole extends string>(
  args: ProvisionUserRoleArgs<TRole>,
): Promise<UserRoleRow<TRole> | null> {
  const { userRoleDelegate, authUserId, orgId, email, defaultRole, centralizedRole, validRoles } =
    args;

  let userRole = await userRoleDelegate.findUnique({
    where: { authUserId_orgId: { authUserId, orgId } },
  });

  if (!userRole) {
    userRole = await userRoleDelegate.findFirst({
      where: { authUserId, active: true },
    });
  }

  if (!userRole) {
    // Prefer the centralized role, but only if it's a valid value of this
    // app's local enum. A global B2B catalog role (#78) such as
    // `USUARIO_NOTARIA` is not part of e.g. `ConsultorRole`, so writing it
    // verbatim would make the enum column reject the insert.
    const preferred =
      centralizedRole && (!validRoles || validRoles.includes(centralizedRole))
        ? centralizedRole
        : defaultRole;
    // Try the preferred role; if the DB still rejects it (enum drift not yet
    // covered by `validRoles`, or a value the catalog knows but the enum
    // doesn't), degrade to `defaultRole` rather than returning null and
    // kicking the user back to login. The default is always a valid enum
    // value, so this never masks an Organization-missing FK error: in that
    // case both attempts fail and we surface null as before.
    const candidates = preferred === defaultRole ? [defaultRole] : [preferred, defaultRole];
    let lastErr: unknown;
    for (const role of candidates) {
      try {
        userRole = await userRoleDelegate.upsert({
          where: { authUserId_orgId: { authUserId, orgId } },
          update: {},
          create: {
            authUserId,
            orgId,
            role,
            displayName: email,
            email,
            active: true,
          },
        });
        lastErr = undefined;
        break;
      } catch (err) {
        lastErr = err;
      }
    }
    if (!userRole) {
      if (args.onError) args.onError(lastErr);
      else
        console.warn(
          '[auth-provision] No se pudo auto-provisionar UserRole (¿Organization no existe?):',
          lastErr,
        );
      return null;
    }
  }

  return userRole;
}
