import { ApiError } from '../api/errors.js';

export function toUserErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.status) {
      case 400:
        return 'Invalid request. Please check the command options.';
      case 401:
        return 'Bot is not authorized to communicate with the backend.';
      case 404:
        return 'User record not found.';
      case 409:
        return 'A conflict occurred. The record may already be in this state.';
      case 503:
        return 'Backend service is temporarily unavailable. Please try again.';
      default:
        return error.retryable
          ? 'A temporary error occurred. Please try again.'
          : 'An unexpected error occurred.';
    }
  }
  return 'An unexpected error occurred. Please try again.';
}
