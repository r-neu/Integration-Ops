declare module "semver" {
  export function satisfies(
    version: string,
    range: string,
    options?: { includePrerelease?: boolean; loose?: boolean },
  ): boolean;
  export function valid(
    version: string,
    options?: { includePrerelease?: boolean; loose?: boolean },
  ): string | null;
}
