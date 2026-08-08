NEON BREACH — Render 배포용 (로컬 실행 파일 없음)

이 프로젝트는 .bat / PowerShell / EXE를 실행하지 않습니다.
한 번 GitHub + Render에 배포한 뒤에는 게임 주소만 접속하면 됩니다.

[배포 순서]

1. 이 ZIP을 압축 해제합니다.
2. GitHub에서 새 Repository를 만듭니다.
3. 압축 푼 폴더 안의 파일 4개/폴더를 Repository에 업로드합니다.
   - server.js
   - package.json
   - render.yaml
   - public/
4. https://dashboard.render.com 에 로그인합니다.
5. New > Blueprint 를 선택하고 방금 만든 GitHub Repository를 연결합니다.
   render.yaml을 읽어 Web Service 설정을 자동으로 만듭니다.
6. 배포가 완료되면 Render가 다음과 비슷한 공개 주소를 줍니다.
   https://neon-breach-online-xxxx.onrender.com
7. 그 주소가 게임 주소입니다. 파일을 실행할 필요가 없습니다.
8. 친구도 같은 주소로 접속합니다.
   CREATE ROOM → 5자리 코드 공유 → 친구가 JOIN

중요
- public/index.html을 더블클릭하지 않습니다.
- 정상 주소는 https://...onrender.com 입니다.
- 공개 HTTPS 페이지에서는 WebSocket도 자동으로 wss:// 를 사용합니다.
- 무료 Render Web Service는 비활성 상태가 지속되면 잠들 수 있어 첫 접속 때 깨어나는 시간이 걸릴 수 있습니다.
- 현재 방 데이터/계정은 메모리에만 존재하므로 서버 재시작 시 초기화됩니다.

프로젝트 구조
/
  server.js
  package.json
  render.yaml
  public/
    index.html

상용 출시까지 추가로 필요한 것
- 영구 DB (PostgreSQL 등)
- 로그인/Steam 인증
- 여러 서버 인스턴스 간 공유 상태(Redis 등)
- 매치메이킹
- 서버 지역 분리
- 더 강한 서버 권위/치트 방지
- 정교한 lag compensation
