// Keep sign-in and payment setup on a known, local product route.
export function safeReturnPath(value: string | null | undefined) {
  return value &&
    /^(?:\/workspace|\/settings|\/agreements\/new(?:\?(?:draft|copy)=[0-9a-f-]{36})?|\/agreements\/[0-9a-f-]{36}(?:\?view=freelancer)?)$/.test(
      value,
    )
    ? value
    : "/workspace";
}
