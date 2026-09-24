import { Catch, HttpException, HttpStatus, type ArgumentsHost } from '@nestjs/common';
import { HttpExceptionFilter } from '../../../../presentation/http/http-exception.filter.js';
import { QualityCommandError } from '../../quality-command.error.js';
@Catch(QualityCommandError)
export class QualityCommandExceptionFilter extends HttpExceptionFilter {
  override catch(exception: QualityCommandError, host: ArgumentsHost): void {
    const status =
      exception.code === 'NOT_FOUND'
        ? HttpStatus.NOT_FOUND
        : exception.code === 'INVALID_INPUT'
          ? HttpStatus.BAD_REQUEST
          : HttpStatus.CONFLICT;
    super.catch(
      new HttpException({ code: exception.code, message: exception.message }, status),
      host,
    );
  }
}
