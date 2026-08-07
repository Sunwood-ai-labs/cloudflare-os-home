/** Maximum retained exception-message length. */
export const MAX_MESSAGE_CHARS = 1024;
/** Maximum retained exception-stack length. */
export const MAX_STACK_CHARS = 16_384;
/** Maximum retained length for identifiers and other bounded strings. */
export const MAX_STRING_CHARS = 256;

/** A bounded, vendor-neutral exception representation. */
export type ErrorExceptionV1 = Readonly<{
  type: string;
  message?: string;
  stack?: string;
  truncated?: true;
}>;

function clipped(value: string, maximum: number): { value: string; truncated: boolean } {
  return value.length <= maximum
    ? { value, truncated: false }
    : { value: value.slice(0, maximum), truncated: true };
}

/** Converts an arbitrary thrown value to bounded, structured-clone-safe exception data. */
export function serializeException(caught: unknown): ErrorExceptionV1 {
  try {
    if (caught === null) return { type: "NullThrown" };
    if (typeof caught === "function") return { type: "FunctionThrown" };
    if (typeof caught !== "object") {
      const message = clipped(String(caught), MAX_MESSAGE_CHARS);
      return {
        type: `${typeof caught}Thrown`,
        message: message.value,
        ...(message.truncated && { truncated: true }),
      };
    }

    let type = "Object";
    let message: string | undefined;
    let stack: string | undefined;
    if (caught instanceof Error) {
      type = readableString(caught, "name") ?? "Error";
      message = readableString(caught, "message");
      stack = readableString(caught, "stack");
    } else {
      const record = caught as Record<string, unknown>;
      const nameValue = ownValue(record, "name");
      const messageValue = ownValue(record, "message");
      const stackValue = ownValue(record, "stack");
      if (typeof nameValue === "string") type = nameValue;
      if (typeof messageValue === "string") message = messageValue;
      if (typeof stackValue === "string") stack = stackValue;
    }

    const boundedType = clipped(type || "Error", MAX_STRING_CHARS);
    const boundedMessage = message === undefined ? undefined : clipped(message, MAX_MESSAGE_CHARS);
    const boundedStack = stack === undefined ? undefined : clipped(stack, MAX_STACK_CHARS);
    const truncated = boundedType.truncated
      || boundedMessage?.truncated === true
      || boundedStack?.truncated === true;
    return {
      type: boundedType.value,
      ...(boundedMessage && { message: boundedMessage.value }),
      ...(boundedStack && { stack: boundedStack.value }),
      ...(truncated && { truncated: true }),
    };
  } catch {
    return { type: "UninspectableThrown", truncated: true };
  }
}

function ownValue(object: Record<string, unknown>, key: string): unknown {
  return Object.getOwnPropertyDescriptor(object, key)?.value;
}

function readableString(value: object, key: string): string | undefined {
  try {
    const property = (value as Record<string, unknown>)[key];
    return typeof property === "string" ? property : undefined;
  } catch {
    return undefined;
  }
}
