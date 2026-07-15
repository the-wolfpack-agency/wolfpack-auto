/**
 * Classify a Postgres error raised while applying a migration statement.
 *
 * WHY THIS EXISTS. run-migration.mjs used to do:
 *
 *     if (msg.includes("already exists") || msg.includes("duplicate")) skipped++;
 *     else { console.error(`WARN: ${msg}`); skipped++; }   // <-- both count as "skipped"
 *
 * so a REAL failure (syntax error, missing column, constraint violation) was
 * counted as "skipped (already exist)" and the script still exited 0. Applying
 * 087 to production printed "2 executed, 6 skipped (already exist)" while four
 * statements had actually FAILED with syntax errors and the table ended up with
 * half the intended schema. The report said success. It was not success.
 *
 * A benign error means "the object is already in the desired state, carry on".
 * Anything else means STOP: the migration did not do what it says it does.
 *
 * Deliberately conservative — an unrecognised message is treated as a FAILURE,
 * never as benign. Misclassifying a real error as benign is what caused the
 * half-applied migration. Misclassifying a benign error as a failure only costs
 * a re-run.
 */

/**
 * Errors that mean "already in the desired state".
 *
 * Scoped tightly to object-already-present messages. Note "duplicate" alone is
 * NOT enough: "duplicate key value violates unique constraint" is a genuine
 * data conflict and must fail the migration, not be shrugged off — the old
 * substring check swallowed exactly that.
 */
const BENIGN = [
  /already exists/i,
  /duplicate column name/i,
  /duplicate object/i,
];

/** True only for errors that mean the object is already in the desired state. */
function isBenignMigrationError(message) {
  const msg = String(message ?? "");
  return BENIGN.some((re) => re.test(msg));
}

/**
 * Messages that are unambiguously real failures. Used only to make the classifier's
 * intent explicit and testable — anything not benign already fails.
 */
function isFatalMigrationError(message) {
  return !isBenignMigrationError(message);
}

module.exports = { isBenignMigrationError, isFatalMigrationError };
