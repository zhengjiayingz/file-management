import { E2eApp } from './app-bootstrap';
import { setUserRole } from './files.helper';
import { E2eUser, registerE2eUser } from './social.helper';

export async function registerE2eAdmin(app: E2eApp): Promise<E2eUser> {
  const user = await registerE2eUser(app);
  await setUserRole(app, user.userId, 'admin');
  return user;
}
