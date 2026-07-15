/**
 * Split a migration file into individually-runnable statements.
 *
 * THE BUG THIS REPLACES. run-migration.mjs used:
 *
 *     sql.split(";").map(s => s.trim()).filter(s => s && !s.startsWith("--"))
 *
 * which drops any chunk that STARTS with a comment. Every migration in this
 * repo opens with a header comment, so the header and the first statement land
 * in the same chunk and the whole chunk was silently discarded — the first
 * statement of the file never ran, and the script still printed success.
 *
 * That is exactly what happened applying 087 to production: `email_hash` (the
 * first ALTER, sitting under the header) was dropped while `phone_hash` (the
 * second, with no leading comment) applied. Half a migration, reported green.
 *
 * A prose semicolon compounds it: splitting on ";" without parsing also cuts a
 * comment mid-sentence, so the fragment after it becomes bare SQL.
 *
 * This strips comment LINES from each chunk and keeps whatever SQL remains,
 * so a header can never swallow the statement beneath it.
 *
 * Deliberately line-based, not a SQL parser: a "--" inside a string literal
 * would be stripped incorrectly. No migration here does that, and a real parser
 * is not worth the dependency. Statements are still split on ";", so a
 * semicolon inside a quoted string still breaks — keep them out of migrations
 * (087's header documents this).
 *
 * CommonJS on purpose: run-migration.mjs imports it as ESM named exports (Node
 * detects those from CJS), and Jest can require it directly. A .mjs helper is
 * unreachable from this repo's CJS jest setup, which would leave it untested.
 */

/** Remove whole-line `--` comments, preserving the rest verbatim. */
function stripCommentLines(chunk) {
  return chunk
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .trim();
}

/**
 * @param {string} sql raw migration file contents
 * @returns {string[]} executable statements, comments removed, empties dropped
 */
function splitStatements(sql) {
  return sql
    .split(";")
    .map(stripCommentLines)
    .filter(Boolean);
}

module.exports = { splitStatements, stripCommentLines };
