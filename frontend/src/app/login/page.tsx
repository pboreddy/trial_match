'use client';

import { useEffect } from 'react';
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        // User is logged in, redirect to home page
        router.push('/');
      }
    });

    // Check initial auth state
    const checkAuth = async () => {
        const { data } = await supabase.auth.getSession();
        if (data.session) {
            router.push('/');
        }
    };
    checkAuth();

    // Cleanup subscription on unmount
    return () => {
      subscription?.unsubscribe();
    };
  }, [supabase, router]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-secondary">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">TrialMatch Login</CardTitle>
        </CardHeader>
        <CardContent>
          <Auth
            supabaseClient={supabase}
            appearance={{ theme: ThemeSupa }}
            theme="light" // Or "dark" or dynamically set based on system/user preference
            providers={['google', 'github']} // Example providers, configure as needed in Supabase dashboard
            redirectTo={`${process.env.NEXT_PUBLIC_BASE_URL}/auth/callback`} // Ensure this matches your Supabase Auth settings
            showLinks={true}
            // localization={{ // Optional: Customize text
            //   variables: {
            //     sign_in: {
            //       email_label: 'Your email address',
            //       password_label: 'Your strong password',
            //     },
            //   },
            // }}
          />
        </CardContent>
      </Card>
    </div>
  );
} 