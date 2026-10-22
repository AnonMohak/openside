/**
 * Public share-link hooks.
 *
 * These talk to the /recording/shared/:token endpoints, which need no account -
 * holding the token is the authorization. `api` still attaches a Clerk token
 * when the visitor happens to be signed in, which is what lets the server
 * attribute their comment to their account instead of a typed-in name.
 */

import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth as useClerkAuth } from "@clerk/clerk-react";
import api from "@/lib/axiosInstance";
import {
  optimisticCommentHandlers,
  type RecordingComment,
  type ScreenOutputKind,
} from "@/hooks/useScreenRecordings";
import { useGetMe } from "@/hooks/useUserQuery";

interface SharedRecording {
  id: string;
  source: "SCREEN_RECORDER" | "SPACE";
  title: string | null;
  description: string | null;
  status: "ACTIVE" | "STOPPED" | "PROCESSING" | "READY" | "FAILED";
  startedAt: string;
  stoppedAt: string | null;
  ownerName: string | null;
  /** Output kinds that exist. The server never sends storage keys here. */
  kinds: ScreenOutputKind[];
  /** Per-kind playback facts for a screen recording (no storage keys). */
  outputs?: Partial<
    Record<
      ScreenOutputKind,
      {
        fileType: string | null;
        durationMs: number | null;
        width: number | null;
        height: number | null;
        fps: number | null;
      }
    >
  >;
  /** Ready, playable tracks for a Space recording. */
  tracks: Array<{
    id: string;
    title: string;
    mimeType: string | null;
    durationMs: number | null;
    width: number | null;
    height: number | null;
    fps: number | null;
    bitrate: number | null;
    hasVideo: boolean;
    hasAudio: boolean;
    isScreenShare: boolean;
    alignedOutputId: string | null;
    cloudOutputId: string | null;
    cloudHasVideo: boolean;
    cloudHasAudio: boolean;
  }>;
}

export const useSharedRecording = (token: string) =>
  useQuery({
    queryKey: ["shared-recording", token],
    queryFn: async () => {
      const { data } = await api.get(`/recording/shared/${token}`);
      return data.data.recording as SharedRecording;
    },
    enabled: !!token,
    staleTime: 30000,
    retry: false,
  });

const viewedKey = (token: string) => `openside:shared-view:${token}`;

/**
 * Count this visit once the recording has loaded - once per tab, so reloads
 * and refetches don't inflate it. Waits for Clerk so a signed-in owner's
 * token is attached and the server can skip their own views.
 */
export const useRecordSharedView = (token: string, ready: boolean) => {
  const { isLoaded } = useClerkAuth();

  useEffect(() => {
    if (!token || !ready || !isLoaded) return;
    try {
      if (sessionStorage.getItem(viewedKey(token))) return;
      sessionStorage.setItem(viewedKey(token), "1");
    } catch {
      // Storage blocked - still count the view.
    }
    api.post(`/recording/shared/${token}/view`).catch(() => {
      // A missed view isn't worth surfacing.
    });
  }, [token, ready, isLoaded]);
};

/** Presigned URL for a shared output - inline for playback, attachment for download. */
export async function fetchSharedOutputUrl(
  token: string,
  kind: ScreenOutputKind,
  download = false,
): Promise<string> {
  const { data } = await api.get(
    `/recording/shared/${token}/output/${kind}/url`,
    { params: { download: download ? 1 : 0 } },
  );
  return data.data.url as string;
}

/** URL for one ready track of a shared Space recording. */
async function fetchSharedFinalOutputUrl(
  token: string,
  outputId: string,
  download = false,
): Promise<string> {
  const { data } = await api.get(
    `/recording/shared/${token}/final-output/${outputId}/url`,
    { params: { download: download ? 1 : 0 } },
  );
  return data.data.url as string;
}

type SharedDownloadResult = {
  ready: boolean;
  url?: string;
  format: "webm" | "mp4" | "mp3" | "wav";
  error?: string;
};

/** Request a shared Space track in a specific format. Derived formats may need
 * a short preparation period, just like downloads in the private project. */
export async function fetchSharedFinalOutputDownload(
  token: string,
  outputId: string,
  format: SharedDownloadResult["format"],
): Promise<SharedDownloadResult> {
  const { data } = await api.get(
    `/recording/shared/${token}/final-output/${outputId}/download`,
    { params: { format } },
  );
  return data.data as SharedDownloadResult;
}

export const useSharedOutputUrl = (
  token: string,
  kind: ScreenOutputKind | undefined,
) =>
  useQuery({
    queryKey: ["shared-output-url", token, kind],
    queryFn: async () => fetchSharedOutputUrl(token, kind as ScreenOutputKind),
    enabled: !!token && !!kind,
    staleTime: 1000 * 60 * 10,
    gcTime: 1000 * 60 * 30,
    retry: false,
  });

export const useSharedFinalOutputUrl = (
  token: string,
  outputId: string | undefined,
) =>
  useQuery({
    queryKey: ["shared-final-output-url", token, outputId],
    queryFn: async () => fetchSharedFinalOutputUrl(token, outputId as string),
    enabled: !!token && !!outputId,
    staleTime: 1000 * 60 * 10,
    gcTime: 1000 * 60 * 30,
    retry: false,
  });

export const useSharedComments = (token: string) =>
  useQuery({
    queryKey: ["shared-comments", token],
    queryFn: async () => {
      const { data } = await api.get(`/recording/shared/${token}/comments`);
      return data.data.comments as RecordingComment[];
    },
    enabled: !!token,
    staleTime: 15000,
    retry: false,
  });

export const useCreateSharedComment = (token: string) => {
  const queryClient = useQueryClient();
  // Signed-in visitors post as their account; the optimistic row shows them.
  const { data: me } = useGetMe();

  return useMutation({
    mutationFn: async (input: {
      body: string;
      authorName?: string;
      timestampMs: number | null;
      parentId?: string;
    }) => {
      const { data } = await api.post(`/recording/shared/${token}/comments`, {
        body: input.body,
        authorName: input.authorName,
        timestampMs: input.timestampMs,
        parentId: input.parentId,
      });
      return data.data.comment as RecordingComment;
    },
    ...optimisticCommentHandlers(queryClient, ["shared-comments", token], me),
  });
};
