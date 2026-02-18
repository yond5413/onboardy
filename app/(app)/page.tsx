import { redirect } from 'next/navigation';
import { createClient } from '@/app/lib/supabase/server';

export default async function HomePage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    // Authenticated users are redirected to dashboard
    redirect('/dashboard');
  }

  // This code should not be reached due to middleware redirecting to login
  // but is kept for completeness if someone accesses via other means
  redirect('/login');
}
