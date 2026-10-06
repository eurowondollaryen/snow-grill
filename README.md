# 스노우 그릴 (Snow Grill)

설원에서 자동으로 회전하는 도끼로 곰을 사냥하고, 고기를 손질·구워 손님에게 팔아 캠프를 키우는 하이퍼캐주얼 아이들 아케이드 게임입니다. 기획서: [GAME_SPEC.md](GAME_SPEC.md)

- 엔진: **Three.js(3D, 로우폴리)** + TypeScript(strict) + Vite, HUD는 HTML/CSS
- 그래픽과 사운드는 모두 런타임에 직접 생성합니다(외부 에셋 없음, IP 걱정 없음).

## 실행

```bash
npm install
npm run dev        # http://localhost:5173 (같은 Wi‑Fi의 휴대폰에서도 접속 가능)
npm test           # Vitest 단위 테스트 (경제·업그레이드·저장)
npm run build      # dist/ 에 정적 빌드 (GitHub Pages 등 아무 정적 호스팅에 업로드)
npm run preview    # 빌드 결과 미리보기
```

`vite.config.ts`의 `base: './'` 설정 덕분에 `dist/` 폴더를 어떤 하위 경로에 올려도 동작합니다.

## 조작

| 플랫폼 | 이동 |
|---|---|
| PC | WASD / 방향키 |
| 모바일 | 화면 아무 곳이나 터치 후 드래그(가상 조이스틱) |

존 위에 서 있기만 하면 아이템이 자동으로 오갑니다. 우상단 톱니바퀴 버튼에서 사운드를 켜고 끄거나 진행을 초기화할 수 있습니다.

## 진행 구조 (끝없는 루프)

1. **캠프 키우기** — 시설(그릴·대장간·보석 사냥터·정육대·판매대) / 자동화(계산원·**레일: 정육대→그릴, 그릴→판매대**·사냥꾼) 두 갈래 해금
   - **보석 사냥터(B)**: 곰이 고기 대신 💎 보석을 떨어뜨림 → 💎 보석 상점에서 **영구** 강화(다음 지역에도 유지)
2. **다음 지역** — 모두 해금하면 썰매가 열림 → 지역 정복 ★ 획득(영구 판매 수입 +15%/★) → 새 테마·새 곰으로 처음부터, 가격·수입 ×3
   - 설원 캠프 → 침엽수림 → 얼음 동굴 → 온천 화산 → 오로라 빙원 → (II, III… 무한)
3. **거대 곰** — 75초마다 사냥터 A에 등장, 처치 시 고기 대량
4. **미션** — 사냥·판매·콤보·수입·보스·강화 미션이 끝없이 이어지고 즉시 보상
5. **콤보** — 1.8초 안에 연속 처치, 5콤보마다 보너스 고기

## 캐릭터 꾸미기

- 처음 시작하면 **나만의 캐릭터 만들기** 화면이 열립니다(나중에는 왼쪽 위 이름표나 ⚙ → 캐릭터 꾸미기).
- **사진 선택 / 셀카 찍기** → 원 안에 얼굴을 맞추면(드래그·슬라이더·휠·두 손가락) 3D 캐릭터 얼굴에 입혀집니다. 툰 필터 on/off.
- **사진에서 색 가져오기**: 피부·머리·옷 색을 사진에서 자동 추출. 팔레트/직접 색 선택도 가능.
- 모자(비니/털모자/없음=머리카락), 코트·목도리·모자 색, **이름**(최대 10자).
- 얼굴 사진은 256px로 압축해 **이 기기 브라우저(localStorage)에만** 저장되며 어디에도 전송되지 않습니다. 진행 초기화 시 함께 삭제됩니다.

## 디버그 모드

`?debug=1`을 붙이면 충돌 범위·존·자석 범위 표시, FPS/엔티티 수, **+1000 코인** 버튼이 나타납니다.

## 구조

```
src/
  config/balance.ts     모든 수치·레이아웃 (하드코딩 금지)
  config/stages.ts      지역 테마·배율
  config/upgrades.ts    업그레이드 테이블·비용 공식·능력치 계산
  config/perks.ts       보석 상점 영구 강화
  engine/               Renderer(카메라·조명·그림자), models(로우폴리 모델), ItemBatch(인스턴싱),
                        Labels(3D 위치 HTML 라벨), Particles, Physics(충돌), Tween
  game/                 Game(메인 루프·월드 구성), Spawner(곰·손님)
  entities/             Player, Axe, Bear, Customer, Worker, ItemStack, Pickup, Fly
  stations/             Station, Counter(+돈더미), Rail(컨베이어), BuyZone, Zone
  systems/              GameState, Economy, Save, Mission, Transfer, Tutorial, Sound
  ui/                   Hud(HTML/CSS HUD), hud.css
  utils/                path(직원 경로), math
tests/                  economy / upgrades / save / stages(지역·미션)
```

## 저장

`localStorage`의 `snowgrill.save.v1` 키에 5초마다, 그리고 탭을 숨기거나 닫을 때 저장합니다. 코인, 업그레이드, 해금(부분 결제 포함), 직원, 튜토리얼, 총 판매량, 시설 안의 재고, 돈더미, 들고 있던 고기까지 저장합니다. 직원이 있으면 다시 접속했을 때 오프라인 보상(경과 분 × 분당 수익 × 0.3, 최대 2시간)을 받습니다.
