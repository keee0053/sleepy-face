import type { Weekday } from '@/services/alarm';

export type MockAlarm = {
  id: string;
  hour: number;
  minute: number;
  weekdays: Weekday[];
  isEnabled: boolean;
};

export type MockFriend = {
  id: string;
  displayName: string;
  userId: string;
  statusText: string;
};

export type MockFailurePhoto = {
  id: string;
  friendName: string;
  userId: string;
  failedAt: string;
  caption: string;
  accentColor: string;
};

export type MockQuizQuestion = {
  id: string;
  prompt: string;
  answer: string;
};

export const mockUser = {
  displayName: 'eisuke',
  userId: 'sleepy_eisuke',
  alarmSummary: '次のアラームは 07:30',
};

export const mockFriends: MockFriend[] = [
  {
    displayName: 'haru',
    id: 'friend-1',
    statusText: '昨日 08:12 に失敗',
    userId: 'haru_sleep',
  },
  {
    displayName: 'mika',
    id: 'friend-2',
    statusText: '今日は成功',
    userId: 'mika_asa',
  },
  {
    displayName: 'ren',
    id: 'friend-3',
    statusText: '2日前に失敗',
    userId: 'ren_alarm',
  },
];

export const mockFailurePhotos: MockFailurePhoto[] = [
  {
    accentColor: '#d9d9d9',
    caption: 'クイズ時間切れで写真が公開されました',
    failedAt: '08:12',
    friendName: 'haru',
    id: 'photo-1',
    userId: 'haru_sleep',
  },
  {
    accentColor: '#eeeeee',
    caption: 'あと1問で間に合わず失敗',
    failedAt: '07:58',
    friendName: 'ren',
    id: 'photo-2',
    userId: 'ren_alarm',
  },
];

export const mockAlarms: MockAlarm[] = [
  {
    hour: 7,
    id: 'mock-alarm-1',
    isEnabled: true,
    minute: 30,
    weekdays: [1, 2, 3, 4, 5],
  },
  {
    hour: 9,
    id: 'mock-alarm-2',
    isEnabled: false,
    minute: 0,
    weekdays: [0, 6],
  },
];

export const mockQuizQuestions: MockQuizQuestion[] = [
  {
    answer: '88',
    id: 'quiz-1',
    prompt: '43 + 45',
  },
  {
    answer: '26',
    id: 'quiz-2',
    prompt: '71 - 45',
  },
  {
    answer: '103',
    id: 'quiz-3',
    prompt: '58 + 45',
  },
];

export const weekdayLabels: Record<Weekday, string> = {
  0: '日',
  1: '月',
  2: '火',
  3: '水',
  4: '木',
  5: '金',
  6: '土',
};
