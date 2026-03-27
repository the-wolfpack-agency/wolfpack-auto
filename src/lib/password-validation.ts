/**
 * Password strength validation utility.
 *
 * Called during user registration and password change flows.
 * NOT called during login (login only checks bcrypt hash).
 */

export interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
}

const MIN_LENGTH = 12;

/**
 * Validate that a password meets minimum strength requirements.
 *
 * Requirements:
 *   - Minimum 12 characters
 *   - At least one uppercase letter (A-Z)
 *   - At least one lowercase letter (a-z)
 *   - At least one digit (0-9)
 *   - At least one special character (!@#$%^&*()_+-=[]{}|;':\",./<>?)
 */
export function validatePasswordStrength(
  password: string,
): PasswordValidationResult {
  const errors: string[] = [];

  if (password.length < MIN_LENGTH) {
    errors.push(`Password must be at least ${MIN_LENGTH} characters long.`);
  }

  if (!/[A-Z]/.test(password)) {
    errors.push("Password must contain at least one uppercase letter.");
  }

  if (!/[a-z]/.test(password)) {
    errors.push("Password must contain at least one lowercase letter.");
  }

  if (!/[0-9]/.test(password)) {
    errors.push("Password must contain at least one number.");
  }

  if (!/[^A-Za-z0-9]/.test(password)) {
    errors.push("Password must contain at least one special character.");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
