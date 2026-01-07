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
    "why not",


    "YES",
    "YEAH",
    "YUP",
    "SURE",
    "OK",
    "OKAY",
    "PLEASE",
    "I WANT",
    "WHY NOT"

  ].some(word => msg.includes(word));
}

export function isNegativeResponse(text = "") {
  const msg = text.toLowerCase();
  return ["no", "not now", "later", "don't", "dont", "NO",
    "NOT NOW",
    "LATER",
    "DON'T",
    "DONT"].some(word =>
      msg.includes(word)
    );
}

