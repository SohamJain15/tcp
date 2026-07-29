import type { AuthenticatedUser } from "../shared/types/auth";
import type { Department } from "../shared/types/domain";

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      /**
       * Set only by the requireHod middleware, from the caller's saved profile.
       * A typed Department that provably did not come from client input.
       */
      hodContext?: { department: Department };
    }
  }
}

export {};
