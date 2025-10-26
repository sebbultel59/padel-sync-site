import { Redirect } from 'expo-router';
import { useAuth } from '../context/auth';

export default function Index() {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return null;
  return <Redirect href={isAuthenticated ? '/groupes' : '/signin'} />;
}