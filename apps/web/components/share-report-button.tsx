'use client';

import { useEffect, useState } from 'react';
import { Check, LoaderCircle, Share2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';

interface ShareReportButtonProps {
  reportId: string;
  brandName: string;
  brandColor?: string;
  onUrlCreated?: (url: string) => void;
}

export function ShareReportButton({
  reportId,
  brandName,
  brandColor,
  onUrlCreated,
}: ShareReportButtonProps) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  const share = trpc.share.create.useMutation({
    onSuccess: ({ url }) => {
      onUrlCreated?.(url);
      void copyUrl(url);
    },
    onError: (error) => {
      setCopyError(error.message || 'Couldn’t create a share link. Try again.');
    },
  });

  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 2_500);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  async function copyUrl(url: string) {
    setCopyError(null);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopyError('The link was created, but could not be copied. Copy it from your browser address bar.');
    }
  }

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <Button
        type="button"
        variant="outline"
        onClick={() => share.mutate({ reportId, brandName, brandColor })}
        disabled={share.isPending}
        aria-label="Share report with client"
      >
        {share.isPending ? <LoaderCircle className="animate-spin" /> : copied ? <Check /> : <Share2 />}
        {share.isPending ? 'Creating link…' : copied ? 'Link copied' : 'Share with client'}
      </Button>
      {copyError && (
        <p className="text-xs text-destructive" role="status">
          {copyError}
        </p>
      )}
    </div>
  );
}
