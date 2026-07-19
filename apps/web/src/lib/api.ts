export const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

export function formatApiError(message?: string | string[]) {
  if (Array.isArray(message)) {
    return message.join(" ");
  }

  return message ?? "Something went wrong.";
}

export async function readApiJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}
