import type { FastifyReply } from 'fastify';
import type { ProblemCode } from '../errors.js';

export function sendProblem(
  reply: FastifyReply,
  status: number,
  code: ProblemCode,
  title: string,
  detail: string,
): FastifyReply {
  return reply
    .code(status)
    .header('content-type', 'application/problem+json; charset=utf-8')
    .send({
      type: `https://agroshield.example/problems/${code}`,
      title,
      status,
      detail,
      code,
    });
}
