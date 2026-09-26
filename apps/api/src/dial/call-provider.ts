/**
 * Call provider abstraction.
 * CALL_PROVIDER=mock|real (default mock). REAL fails closed without vendor keys.
 */
export type CallStartInput = {
  case_id: string;
  tenant_id: string;
  dial_item_id?: string | null;
  to_phone?: string | null;
};

export type CallStartResult = {
  ok: boolean;
  mode: 'mock' | 'real';
  provider: string;
  duration_sec: number | null;
  recording_url: string | null;
  result: string;
  meta: Record<string, unknown>;
  error?: string;
};

export function getCallProviderMode(): 'mock' | 'real' {
  const v = (process.env.CALL_PROVIDER || 'mock').toLowerCase();
  return v === 'real' ? 'real' : 'mock';
}

export async function startCall(input: CallStartInput): Promise<CallStartResult> {
  const mode = getCallProviderMode();
  if (mode === 'mock') {
    const duration = 30 + Math.floor(Math.random() * 90);
    return {
      ok: true,
      mode: 'mock',
      provider: 'mock',
      duration_sec: duration,
      recording_url: `mock://recording/${input.case_id}/${Date.now()}`,
      result: 'connected',
      meta: {
        mock: true,
        note: 'MOCK 通话记录；非真实外呼。设置 CALL_PROVIDER=real 并配置官方供应商密钥后可切换。',
        to_phone: input.to_phone || null,
      },
    };
  }

  // REAL path — fail closed without keys
  const vendor = process.env.CALL_VENDOR || '';
  const apiKey = process.env.CALL_API_KEY || '';
  const apiSecret = process.env.CALL_API_SECRET || '';
  if (!vendor || !apiKey || !apiSecret) {
    return {
      ok: false,
      mode: 'real',
      provider: vendor || 'unconfigured',
      duration_sec: null,
      recording_url: null,
      result: 'failed_closed',
      meta: {},
      error: 'REAL 外呼未配置：请设置 CALL_VENDOR / CALL_API_KEY / CALL_API_SECRET（官方供应商），或改回 CALL_PROVIDER=mock',
    };
  }

  // Stub adapter: no live vendor integration in this pack — fail closed honestly
  return {
    ok: false,
    mode: 'real',
    provider: vendor,
    duration_sec: null,
    recording_url: null,
    result: 'failed_closed',
    meta: { vendor },
    error: `REAL 适配器（${vendor}）已预留但本包未接通官方线路；请联系实施配置官方 API，或使用 CALL_PROVIDER=mock 演示`,
  };
}
