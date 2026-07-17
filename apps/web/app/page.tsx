import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="text-3xl">VoxMarketer</CardTitle>
          <CardDescription>Your voice-first AI marketing team</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Talk to your marketing team: SEO, ads, and leads — run by AI agents you
            supervise and approve by voice.
          </p>
          <Button className="w-full">Get started</Button>
        </CardContent>
      </Card>
    </main>
  );
}
