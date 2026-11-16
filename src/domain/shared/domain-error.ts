/**
 * Errors raised by the domain and application layers. They know nothing about
 * HTTP; the presentation layer maps them to status codes.
 */
export abstract class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** Input breaks a business rule (HTTP 400). */
export class ValidationError extends DomainError {}

/** The thing asked for does not exist (HTTP 404). */
export class NotFoundError extends DomainError {}

/** The request clashes with the current state (HTTP 409). */
export class ConflictError extends DomainError {}
