import Stats from '@app/components/Stats';
import useRouteGuard from '@app/hooks/useRouteGuard';
import { Permission } from '@app/hooks/useUser';
import type { NextPage } from 'next';

const StatsPage: NextPage = () => {
  useRouteGuard(Permission.ADMIN);
  return <Stats />;
};

export default StatsPage;
