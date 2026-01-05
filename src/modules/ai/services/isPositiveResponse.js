export function isPositiveResponse(text = "") {
  const msg = text.toLowerCase();
  return [
    "yes",
    "yeah",
    "yup",
    "sure",
    "ok",
    "okay",
    "please",
    "i want",
    "why not"
  ].some(word => msg.includes(word));
}

export function isNegativeResponse(text = "") {
  const msg = text.toLowerCase();
  return ["no", "not now", "later", "don't", "dont"].some(word =>
    msg.includes(word)
  );
}

