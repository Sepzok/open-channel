export type ProblemCode =
  | 'unauthorized'
  | 'unsupported_version'
  | 'validation_error'
  | 'capability_unsupported'
  | 'not_found'
  | 'conflict'
  | 'deleted'
  | 'idempotency_conflict'
  | 'file_not_found'
  | 'file_too_large'
  | 'anchor_unsupported'
  | 'threads_unsupported'
  | 'share_unavailable'
  | 'share_forbidden'
  | 'range_not_satisfiable'
  | 'forbidden';

const TITLES: Record<ProblemCode, string> = {
  unauthorized: 'Unauthorized',
  unsupported_version: 'Unsupported version',
  validation_error: 'Validation error',
  capability_unsupported: 'Capability unsupported',
  not_found: 'Not found',
  conflict: 'Conflict',
  deleted: 'Deleted',
  idempotency_conflict: 'Idempotency conflict',
  file_not_found: 'File not found',
  file_too_large: 'File too large',
  anchor_unsupported: 'Anchor unsupported',
  threads_unsupported: 'Threads unsupported',
  share_unavailable: 'Share unavailable',
  share_forbidden: 'Share forbidden',
  range_not_satisfiable: 'Range not satisfiable',
  forbidden: 'Forbidden',
};

const STATUS: Record<ProblemCode, number> = {
  unauthorized: 401,
  unsupported_version: 400,
  validation_error: 400,
  capability_unsupported: 404,
  not_found: 404,
  conflict: 409,
  deleted: 409,
  idempotency_conflict: 409,
  file_not_found: 400,
  file_too_large: 413,
  anchor_unsupported: 400,
  threads_unsupported: 400,
  share_unavailable: 404,
  share_forbidden: 403,
  range_not_satisfiable: 416,
  forbidden: 403,
};

export function problem(
  code: ProblemCode,
  extra?: {
    capability?: string;
    current_revision?: string;
    errors?: { path: string; message: string }[];
  },
) {
  const urn = `urn:ocp:problem:${code.replace(/_/g, '-')}`;
  return {
    type: urn,
    title: TITLES[code],
    status: STATUS[code],
    code,
    ...extra,
  };
}
