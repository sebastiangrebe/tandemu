'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { getTeams } from '@/lib/api';
import type { Team } from '@tandemu/types';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const TIME_RANGES = [
  { label: '7 days', value: '7d', days: 7 },
  { label: '14 days', value: '14d', days: 14 },
  { label: '30 days', value: '30d', days: 30 },
  { label: '90 days', value: '90d', days: 90 },
];

interface TelemetryFiltersProps {
  showTeamFilter?: boolean;
}

export function TelemetryFilters({ showTeamFilter = true }: TelemetryFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentOrg } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);

  const teamId = searchParams.get('team') ?? '';
  const timeRange = searchParams.get('range') ?? '30d';

  useEffect(() => {
    if (currentOrg && showTeamFilter) {
      getTeams(currentOrg.id).then(setTeams).catch(() => {});
    }
  }, [currentOrg, showTeamFilter]);

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    router.replace(`?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-2">
      {showTeamFilter && teams.length > 0 && (
        <Select value={teamId || 'all'} onValueChange={(v) => setParam('team', v === 'all' ? '' : v)}>
          <SelectTrigger className="w-full max-w-48">
            <SelectValue placeholder="All teams" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="all">All teams</SelectItem>
              {teams.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      )}
      <Select value={timeRange} onValueChange={(v) => setParam('range', v)}>
        <SelectTrigger className="w-full max-w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {TIME_RANGES.map((r) => (
              <SelectItem key={r.value} value={r.value}>Last {r.label}</SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}

/** Hook to read filter values from URL search params.
 *  Returns stable strings — same range always produces the same references. */
export function useFilterParams() {
  const searchParams = useSearchParams();
  const range = searchParams.get('range') ?? '30d';
  const teamId = searchParams.get('team') ?? '';

  const { startDate, endDate } = useMemo(() => {
    const days = TIME_RANGES.find(r => r.value === range)?.days ?? 30;
    return {
      startDate: new Date(Date.now() - days * 86400_000).toISOString().split('T')[0] + 'T00:00:00Z',
      endDate: new Date().toISOString().split('T')[0] + 'T23:59:59Z',
    };
  }, [range]);

  return { teamId, startDate, endDate, range };
}
