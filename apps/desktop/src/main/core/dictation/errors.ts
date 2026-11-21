import { HelperErrorCode } from '@sayso/helper-protocol';
import { HelperRequestError } from '../../helper/HelperProcess.ts';

/** A short message for the listening pill. */
export function describeError(error: unknown): string {
  if (error instanceof HelperRequestError) {
    switch (error.code) {
      case HelperErrorCode.micDenied:
        return 'Microphone access is off for Sayso.';
      case HelperErrorCode.micFailed:
        return 'Could not start the microphone.';
      case HelperErrorCode.accessibilityDenied:
        return 'Accessibility access is off, so Sayso cannot type.';
      case HelperErrorCode.sttFailed:
        return 'Could not transcribe that. Try again.';
      case 'timeout':
        return 'The helper took too long to answer.';
      case 'not_connected':
      case 'helper_exited':
        return 'The Sayso helper is restarting.';
      default:
        return error.message;
    }
  }
  return error instanceof Error ? error.message : String(error);
}
