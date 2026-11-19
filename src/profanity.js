/* Lọc từ cấm cho nội dung KHÁCH nhập (tên, tin nhắn, đánh giá, ghi chú đặt tour).
Phía admin không đi qua đây nên không bị ảnh hưởng.
Lỗi mạng / API quá hạn thì cho qua (không để dịch vụ ngoài làm hỏng đặt tour hay chat). */
const API = 'https://vector.profanity.dev';
const TIMEOUT_MS = 2500;

export async function isProfane(message, fetcher = globalThis.fetch) {
  const text = String(message || '').trim();
  if (!text) {
    return false;
  }
  try {
    const res = await fetcher(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text.slice(0, 2000) }),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    if (!res.ok) {
      return false;
    }
    return (await res.json()).isProfanity === true;
  } catch {
    return false;
  }
}

/* Ném lỗi 400 nếu một trong các đoạn chữ chứa từ cấm. Đặt PROFANITY_FILTER=off để tắt. */
export async function assertClean(env, HttpError, ...texts) {
  if (env && env.PROFANITY_FILTER === 'off') {
    return;
  }
  const joined = texts.filter(Boolean).join('\n');
  if (await isProfane(joined)) {
    throw new HttpError(400, 'Nội dung có từ ngữ không phù hợp. Vui lòng chỉnh sửa lại.', undefined, 'profanity');
  }
}
