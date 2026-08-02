import { Buffer } from "node:buffer";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../constants/domain";

export interface PaginationInput {
  cursor?: string;
  pageSize?: number;
}

export interface PageInfo {
  nextCursor: string | null;
  pageSize: number;
  totalCount: number;
}

export interface PaginatedResult<T> {
  items: T[];
  pageInfo: PageInfo;
}

function encodeCursor(offset: number): string {
  return Buffer.from(String(offset), "utf8").toString("base64");
}

function decodeCursor(cursor?: string): number {
  if (!cursor) {
    return 0;
  }

  try {
    const decoded = Buffer.from(cursor, "base64").toString("utf8");
    const offset = Number(decoded);
    return Number.isFinite(offset) && offset >= 0 ? offset : 0;
  } catch {
    return 0;
  }
}

/**
 * `maxPageSize` overrides the platform-wide ceiling for callers whose result set is bounded by
 * something other than the database — a department roster is a few hundred rows at most, and the
 * service has already built and sorted the whole array before slicing it, so capping it at 50 forces
 * three round trips (each re-loading every submission in the window) to show one class.
 *
 * It stays a cap, not an escape hatch: a client asking for `pageSize=999999` is still clamped.
 */
export function paginateArray<T>(
  items: T[],
  pagination: PaginationInput,
  maxPageSize: number = MAX_PAGE_SIZE,
): PaginatedResult<T> {
  const pageSize = Math.min(Math.max(pagination.pageSize ?? DEFAULT_PAGE_SIZE, 1), maxPageSize);
  const offset = decodeCursor(pagination.cursor);
  const paginatedItems = items.slice(offset, offset + pageSize);
  const nextOffset = offset + paginatedItems.length;

  return {
    items: paginatedItems,
    pageInfo: {
      nextCursor: nextOffset < items.length ? encodeCursor(nextOffset) : null,
      pageSize,
      totalCount: items.length,
    },
  };
}
