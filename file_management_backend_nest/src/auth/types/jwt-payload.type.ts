export type JwtPayload = {
  id: number;
  username: string;
  mustChangePassword?: boolean;
  sv?: number;
};

export type RequestUser = {
  id: number;
  username: string;
  role: string;
  status: string;
};
