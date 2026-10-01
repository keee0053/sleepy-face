# SleepyFace

寝顔写真を撮るまで鳴り止まない目覚ましアプリです。起床チャレンジ(顔認証→クイズ)に失敗すると、寝起きの顔写真が友達のフィードに公開されます。

## 概要

- アラームは、寝顔写真(Face Proof)を撮影するまで鳴り続けます(Androidの`AlarmManager`を使った正確な時刻起床)
- 写真撮影後にクイズが出題され、不正解・制限時間切れなど写真を提出しなかった場合はその日1日フレンドのフィード閲覧がブロックされます
- クイズに失敗すると、寝起きの写真がフレンドのフィードに投稿され、閲覧されます
- 友達同士で「起こす」(相手のアラームを遠隔で鳴らす)「助けて」(寝坊しそうなときに友達に通知を送る)といった、助け合いの機能もあります

## 主な機能

- **アラーム管理**: 時刻・曜日ごとの繰り返し・アラーム音の設定
- **起床チャレンジ**: 前面カメラでの顔写真撮影(Android ML Kitによる顔検出)→クイズ回答
- **フレンドフィード**: 友達の起床結果(成功/失敗)の閲覧、リアクション・コメント
- **フレンド機能**: 友達申請・承認、「起こす」「助けて」
- **プロフィール**: 表示名・アイコン(プリセット or カスタム写真)の設定

## 技術スタック

- **フロントエンド**: Expo (React Native) / TypeScript / Expo Router(ファイルベースルーティング)
- **バックエンド**: Supabase(Postgres、Auth、Storage、Edge Functions、Row Level Security)
- **ネイティブ機能**: Kotlinで実装したカスタムExpo Module(`AlarmManager`による正確なアラーム鳴動・全画面通知・端末起動時の再同期、ML Kit Face Detectionによる顔検出)
- **テスト**: Vitest によるユニットテスト、ESLint/Prettier によるコード品質チェック(コミット時・CI時に自動実行)

## アーキテクチャ上の特徴

- アラームは「鳴動のたびに翌回分を再スケジュールする」one-shot方式で実現しており、再スケジュールの失敗を検知してリトライ・再同期する仕組みを備えています
- Supabase側は`security definer`なPostgres RPC関数と Row Level Security を組み合わせ、フレンド関係の改ざんを防ぐトリガー等でサーバー側のデータ整合性を担保しています

## セットアップ

```bash
npm install
npx expo start
```

Android/顔検出・ネイティブアラーム機能はExpo Goでは動作しないため、Androidの開発ビルド(`expo-dev-client`)でのみ検証できます。詳細は [`docs/current_implementation_spec.md`](./docs/current_implementation_spec.md) を参照してください。

### コード品質チェック

```bash
npm test          # ユニットテスト
npm run lint       # ESLint
npm run format:check
```

## プロジェクトドキュメント

- [現行実装仕様](./docs/current_implementation_spec.md)
- [MVPスコープ](./docs/mvp_scope.md)
- [コードベース構成](./docs/codebase_structure.md)
- [データベース設計](./docs/database_design.md)
- [フロント/バックエンドAPI契約](./docs/api_contract.md)
- [技術スタック詳細](./docs/tech_stack.md)
- [Android Face Proof(顔検出)](./docs/android_face_proof.md)

## クレジット

プリセットプロフィールアイコンなど、サードパーティ素材のクレジットは [`docs/attributions.md`](./docs/attributions.md) に記載しています。
