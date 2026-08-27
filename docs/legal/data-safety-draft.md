# データセーフティフォーム 下書き

Play Console の「アプリのコンテンツ」→「データセーフティ」に入力する内容の下書き。
実際のフォームは項目が細かく分かれているので、この一覧を見ながらチェックを付けていく。

## 収集しているデータ

| データの種類 | 具体的な内容 | 収集タイミング | 必須/任意 |
|---|---|---|---|
| メールアドレス | Supabase Auth / Google Sign-In のログイン用メールアドレス | サインアップ時 | 必須 |
| 名前 | 表示名(ユーザーが自由に設定するニックネーム。本名ではない) | プロフィール設定時 | 必須 |
| 写真 | プロフィールアイコン画像、起床確認用の顔写真(失敗時は記録として保存) | 撮影・アップロード時 | 必須(顔写真はアプリの中核機能) |
| ユーザーが作成したコンテンツ | 写真へのコメント、絵文字リアクション | 投稿時 | 任意 |
| アプリのアクティビティ | 起床成功/失敗の記録と日時、友達関係(誰をフォロー/友達にしたか) | 利用時に自動記録 | 必須(機能上) |
| デバイスまたはその他のID | プッシュ通知トークン(Expo Push Token) | 通知権限の許可時 | 任意(通知を使う場合のみ) |

## 収集していないデータ

- 位置情報
- 連絡先
- 通話履歴・SMS
- 財務情報
- 健康情報
- 閲覧履歴

## 第三者との共有

- 第三者への販売・共有は行っていない
- 以下は「データ処理の委託先」として扱われる(第三者提供ではない):
  - Supabase(データベース・認証・ストレージ・Edge Functions)
  - Firebase Cloud Messaging(プッシュ通知の配信)
  - Expo Push Service(プッシュ通知の中継)

## セキュリティ

- 通信は全てHTTPS/TLSで暗号化
- ユーザーは設定画面からアカウントと関連データを削除できる(不可逆)

## 用途

- アカウント機能(ログイン・プロフィール表示)
- アプリの中核機能の提供(起床確認、友達機能、通知)
- 不正利用防止(通報・ブロック機能)

---

# ストア掲載情報 下書き

## 短い説明(日本語 / 80文字以内)

友達と一緒に、寝坊しない朝を。写真とクイズで起床を記録するアラームアプリ

## 短い説明(英語 / 80 characters max)

Wake up together with friends — a photo & quiz alarm that keeps you honest

## 詳細な説明(日本語)

SleepyFaceは、友達と一緒に「本当に起きたか」を確認し合えるアラームアプリです。

- アラームが鳴ったら、顔写真とクイズで起床を証明
- 失敗すると、その日の寝坊記録が友達に共有される
- 友達が寝坊したままなら、あなたが代わりにアラームを鳴らして起こせる
- 日本語/英語のUIに対応

一人だと止められないアラームも、友達と一緒なら続けられる。

## 詳細な説明(英語)

SleepyFace is an alarm app that helps you and your friends actually wake up — together.

- When the alarm goes off, prove you're awake with a photo and a quiz
- Fail, and your friends find out
- If a friend oversleeps, you can ring their alarm remotely to wake them up
- Available in Japanese and English

Waking up alone is easy to give up on. Waking up with friends isn't.
