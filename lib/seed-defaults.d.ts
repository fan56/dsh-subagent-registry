/**
 * One-time seeding of the bundled default agent roster into the agents
 * directory. A fresh install starts with a usable roster (workhorse /
 * oldfox / rubber-duck) instead of an empty `use_agent` tool.
 *
 * Semantics (mirrors the legacy-layout migration in ./agents-dir.ts): the
 * seed runs only while the target directory holds NO agents — the first
 * non-empty state, however it came about (user files, restored backups),
 * marks the directory as user-owned. Consequences: an existing file is
 * never overwritten, and a deleted default stays deleted. Reruns are
 * no-ops.
 *
 * @module seed-defaults
 */
/**
 * The package-shipped default roster (`<package root>/templates/agents`),
 * resolved relative to the compiled file so it works from any cwd. The
 * `templates` directory ships in the npm `files` list.
 */
export declare function bundledAgentsTemplatesDir(): string;
/**
 * Copy every parseable bundled template into `targetDir` (under the
 * template's frontmatter `name`, keeping the file byte-for-byte). One-time:
 * when `targetDir` already holds agents nothing is written. Broken
 * templates are reported and skipped rather than seeded. Synchronous and
 * cheap (a handful of small files) so `apply` can run it before the
 * `use_agent` tool builds its roster.
 */
export declare function seedBundledAgents(targetDir: string, sourceDir?: string): {
    seeded: number;
    errors: Array<{
        file: string;
        error: string;
    }>;
};
