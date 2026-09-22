export type JwtPayload = {
  sub: string;
  tenant_id: string;
  email: string;
  role: string;
  agent_seat_id?: string;
  display_name?: string;
};

export type AuthUser = JwtPayload;
