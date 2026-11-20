/** Numeric examples retain card identity in their prefix and never reuse a current code. */
export function allocateDemoMarkCodes(currentCodes, cardId, count) {
  if (
    typeof cardId !== 'string' ||
    !/^[1-9]\d{0,19}$/.test(cardId) ||
    !Number.isSafeInteger(count) ||
    count < 0 ||
    count > 999999
  )
    throw new Error('演示刻码须使用真实卡ID及0～999999的示例数量');
  const result = [];
  for (let sequence = 1; result.length < count; sequence += 1) {
    if (sequence > 999999) throw new Error('本卡的演示号码已用尽，请保留现状并换一组样例');
    const code = `8${cardId}${String(sequence).padStart(6, '0')}`;
    if (currentCodes.has(code)) continue;
    currentCodes.add(code);
    result.push(code);
  }
  return result;
}
