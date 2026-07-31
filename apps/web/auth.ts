import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { db, users, accounts, sessions, verificationTokens } from '@growthcrew/db';

const providers = [
  Credentials({
    credentials: {
      email: { label: 'Email', type: 'email' },
      password: { label: 'Password', type: 'password' },
    },
    async authorize(credentials) {
      const email = typeof credentials?.email === 'string' ? credentials.email.toLowerCase().trim() : null;
      const password = typeof credentials?.password === 'string' ? credentials.password : null;
      if (!email || !password) return null;
      const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      if (!user?.passwordHash) return null;
      if (!bcrypt.compareSync(password, user.passwordHash)) return null;
      return { id: user.id, email: user.email, name: user.name };
    },
  }),
  // Google OAuth only when both env vars are configured (CONTRACTS §3).
  ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ? [
        Google({
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        }),
      ]
    : []),
];

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: 'jwt' }, // required for the Credentials provider
  trustHost: true,
  secret: process.env.AUTH_SECRET,
  pages: { signIn: '/login' },
  providers,
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
});
