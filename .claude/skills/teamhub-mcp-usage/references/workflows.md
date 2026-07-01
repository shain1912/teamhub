# 실행 예시 모음

## 채널 요약 → 공지 게시

```
list_messages(channel: "general", limit: 100)
# → 반환된 메시지들을 읽고 3~5줄로 요약
post_announcement(title: "오늘의 요약 (7/1)", body: "<요약문>", priority: "normal")
```

## 티켓 하나 만들고 담당자 지정

```
create_ticket(title: "결제 버그", description: "...", priority: "high", due_date: "2026-07-05")
# → 반환된 ticket_id 사용
assign_ticket(ticket_id: "<id>", assignee_email: "dev@kodekorea.kr")
```

`update_ticket`으로 담당자를 바꾸지 않는 이유: `assign_ticket`은 알림 발송 + 감사 로그 기록을 자동으로 해준다.

## 프로젝트 계획 통째로 넣기 (간트 + 스프린트 + 티켓 + 체크리스트)

일정이 있는 다단계 작업(마이그레이션, 출시 준비 등)을 통째로 TeamHub에 옮길 때 쓰는 순서:

```
1. create_project(name, description, start_date, end_date)
2. create_sprint(name, project: "<프로젝트명>", start_date, end_date, status: "active")
3. create_gantt_task(project: "<프로젝트명>", title, start_date, end_date)  # 작업당 1회, 병렬 가능
4. create_ticket(title, description, priority, due_date)                    # 작업당 1회, 병렬 가능
5. move_ticket_to_sprint(ticket_id, sprint: "<스프린트명>")                  # 티켓마다
6. create_checklist(title, ticket_id, project: "<프로젝트명>")
   add_checklist_item(checklist: "<체크리스트명>", content)  # 항목마다 반복
```

- 3번과 4번은 서로 의존하지 않으므로 각각 여러 개를 한 번에 병렬로 호출해도 된다.
- 간트 작업 제목과 티켓 제목을 동일하게 맞추면 간트 뷰와 티켓 리스트를 오갈 때 헷갈리지 않는다.
- 체크리스트는 `ticket_id`(정확한 UUID, 생성 시 반환값)로 연결한다 — 티켓 제목으로는 연결되지 않는다.

## 체크리스트 항목 추가 + 팔로업

```
add_checklist_item(checklist: "출시 준비", content: "Render 배포", follow_up_at: "2026-07-02T09:00:00+09:00")
```

`follow_up_at`은 ISO 8601. 단순 마감일이면 `due_date`(YYYY-MM-DD)를 쓴다.

## 이름이 모호할 때

프로젝트/채널/체크리스트/스프린트 이름이 여러 개와 겹쳐서 도구가 에러를 내면, 먼저 목록을 조회해 UUID를 특정한다:

```
list_projects()  # 또는 list_channels(), list_checklists(), list_sprints()
# → 반환된 id를 이름 대신 사용
```
