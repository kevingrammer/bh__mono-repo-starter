import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Home from './index';
import { fetchPlayerDetail, fetchPlayers } from '@/lib/api';

jest.mock('@/lib/api', () => ({
  fetchPlayers: jest.fn(),
  fetchPlayerDetail: jest.fn(),
}));

const mockFetchPlayers = fetchPlayers as jest.MockedFunction<typeof fetchPlayers>;
const mockFetchPlayerDetail = fetchPlayerDetail as jest.MockedFunction<typeof fetchPlayerDetail>;

const listResponse = {
  players: [
    {
      player_id: '1',
      first_name: 'Patrick',
      last_name: 'Mahomes',
      full_name: 'Patrick Mahomes',
      search_full_name: 'patrick mahomes',
      position: 'QB',
      team: 'KC',
      status: 'Active',
      age: 29,
      height: '74',
      weight: '225',
      years_exp: 7,
      college: 'Texas Tech',
      jersey_number: 15,
      injury_status: null,
    },
  ],
  total: 1,
  page: 1,
  limit: 25,
  totalPages: 1,
  cachedAt: '2026-05-01T13:30:00.000Z',
  facets: {
    positions: ['QB'],
    teams: ['KC'],
    statuses: ['Active'],
  },
  source: {
    rawCount: 1,
    usableCount: 1,
    includedInactive: false,
  },
};

const detailResponse = {
  ...listResponse.players[0],
  active: true,
  fantasy_positions: ['QB'],
  birth_date: '1995-09-17',
  depth_chart_position: 'QB',
  depth_chart_order: 1,
  injury_body_part: null,
  number: 15,
  hashtag: '#Showtime',
};

describe('Home page interactions', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    window.localStorage.clear();
    mockFetchPlayers.mockResolvedValue(listResponse);
    mockFetchPlayerDetail.mockResolvedValue(detailResponse);
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('debounces search requests before refetching players', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    render(<Home />);

    expect(await screen.findByText('Patrick')).toBeInTheDocument();
    expect(mockFetchPlayers).toHaveBeenCalledTimes(1);

    await user.type(screen.getByLabelText('Search players'), 'Mah');

    expect(mockFetchPlayers).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(300);
    });

    await waitFor(() => expect(mockFetchPlayers).toHaveBeenCalledTimes(2));
    expect(mockFetchPlayers.mock.calls[1]?.[0]).toMatchObject({ q: 'Mah' });
  });

  it('lets the user favorite a player and open the detail modal', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    render(<Home />);

    expect(await screen.findByText('Patrick')).toBeInTheDocument();

    await user.click(screen.getByLabelText('Favorite'));
    expect(screen.getByText('Show Favorites Only (1)')).toBeInTheDocument();

    await user.click(screen.getByText('Patrick').closest('tr') as HTMLElement);

    await waitFor(() => expect(mockFetchPlayerDetail).toHaveBeenCalledWith('1'));
    expect(await screen.findByRole('dialog', { name: /details for patrick mahomes/i })).toBeInTheDocument();
    expect(screen.getByText('225 lbs')).toBeInTheDocument();
  });
});
