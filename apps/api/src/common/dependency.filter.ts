import {
  Catch, ExceptionFilter, ArgumentsHost, HttpStatus, Logger,
} from '@nestjs/common';
import { Response } from 'express';

function classifyDependencyError(err: unknown): { dependency: 'postgres' | 'redis' | 'unknown'; message: string } | null {
  const e = err as { code?: string; message?: string; name?: string };
  const msg = String(e?.message || e || '');
  const code = String(e?.code || '');
  // node-pg / TypeORM connection failures
  if (
    code === 'ECONNREFUSED'
    || code === 'ETIMEDOUT'
    || code === 'ENOTFOUND'
    || code === '57P01' // admin_shutdown
    || code === '57P02'
    || code === '57P03'
    || /Connection terminated|ECONNRESET|connect ECONNREFUSED|the database system is (starting up|shutting down)|Connection refused|cannot connect/i.test(msg)
    || /Driver not Connected|Connection is closed|Failed to connect/i.test(msg)
  ) {
    if (/redis|ECONNREFUSED.*6379|ECONNREFUSED.*56380/i.test(msg)) {
      return { dependency: 'redis', message: msg.slice(0, 200) };
    }
    return { dependency: 'postgres', message: msg.slice(0, 200) };
  }
  if (/Redis|READONLY|LOADING|NOAUTH/i.test(msg) && /redis/i.test(msg + (e?.name || ''))) {
    return { dependency: 'redis', message: msg.slice(0, 200) };
  }
  return null;
}

/**
 * Maps dependency outages to recoverable 503 for business/workbench APIs.
 * Does not mask application bugs as dependency failures.
 */
@Catch()
export class DependencyExceptionFilter implements ExceptionFilter {
  private readonly log = new Logger('DependencyFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const dep = classifyDependencyError(exception);

    // If Nest HttpException / already handled shapes, rethrow via default
    const anyEx = exception as { getStatus?: () => number; getResponse?: () => unknown };
    if (typeof anyEx?.getStatus === 'function') {
      const status = anyEx.getStatus();
      const body = anyEx.getResponse?.() ?? { message: (exception as Error)?.message };
      res.status(status).json(typeof body === 'string' ? { statusCode: status, message: body } : body);
      return;
    }

    if (dep) {
      this.log.warn(`dependency unavailable: ${dep.dependency} — ${dep.message}`);
      res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
        statusCode: 503,
        code: 'DEPENDENCY_UNAVAILABLE',
        dependency: dep.dependency,
        message: dep.dependency === 'postgres'
          ? '数据库暂不可用，请稍后重试（可恢复）'
          : 'Redis 暂不可用，请稍后重试（可恢复）',
        recoverable: true,
        detail: dep.message,
      });
      return;
    }

    this.log.error(exception);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: '服务器内部错误',
    });
  }
}
