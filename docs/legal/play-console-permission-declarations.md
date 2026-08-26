# Google Play Console: 権限の使用目的申請

Play Console の「アプリのコンテンツ」→「権限の宣言」（App content → Permissions declaration）フォームに、
以下の権限ごとに使用目的の説明を提出する必要があります。フォームは英語での記入が求められることが多いため、
英語の申請文を用意しています。日本語訳は自分用の確認メモです。

このアプリは `SCHEDULE_EXACT_ALARM` と `USE_FULL_SCREEN_INTENT` を
`modules/alarm-ringing`（ネイティブアラームモジュール）で宣言しています（`src/services/android-alarm-mechanics.ts`
がこのモジュールを呼び出しています）。

## SCHEDULE_EXACT_ALARM

**申請文（英語、そのまま貼り付け可）:**

> SleepyFace is an alarm clock app. Its core function is to wake the user up at an
> exact, user-specified time by scheduling a native Android alarm. `SCHEDULE_EXACT_ALARM`
> is required so the alarm fires at the precise minute the user set, rather than being
> delayed by Doze mode or App Standby batching, which would defeat the app's purpose as
> an alarm clock.

**日本語（確認用）:**

> SleepyFaceは目覚まし時計アプリです。ユーザーが指定した正確な時刻にアラームを鳴らすことが中核機能であり、
> `SCHEDULE_EXACT_ALARM`がないとDozeモード等によってアラームの発火が遅延し、目覚まし時計として機能しません。

## USE_FULL_SCREEN_INTENT

**申請文（英語、そのまま貼り付け可）:**

> SleepyFace uses `USE_FULL_SCREEN_INTENT` to display the alarm-ringing screen as a
> full-screen interruption even when the device is locked, matching standard alarm clock
> behavior. This is essential so the user can see and stop the alarm (including the
> app's photo-based "Wake Up Challenge") without first having to unlock the device from
> a lock-screen notification, which could cause the alarm to go unnoticed.

**日本語（確認用）:**

> SleepyFaceは、端末がロックされていてもアラーム画面をフルスクリーンで表示するために
> `USE_FULL_SCREEN_INTENT`を使用しています。通常の目覚まし時計と同様、ロック画面の通知を
> タップして解除する手順を挟まずに即座にアラーム（および写真を使った起床チャレンジ）を
> 表示・停止できるようにするために必須です。

## 提出手順

1. Play Console → 対象アプリ → 「アプリのコンテンツ」→「権限の宣言」
2. 該当する権限（Alarms & reminders / Full-screen intent など、Playの分類名）にチェック
3. 上記の英語申請文を該当欄に貼り付け
4. 保存して審査に提出
