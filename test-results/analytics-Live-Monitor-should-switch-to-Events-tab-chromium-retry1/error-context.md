# Page snapshot

```yaml
- generic [ref=e3]:
  - alert:
    - generic:
      - generic: Reconnecting... (attempt 0)
  - generic [ref=e4]:
    - banner [ref=e5]:
      - generic [ref=e6]:
        - heading "Live Monitor" [level=1] [ref=e7]
        - generic: Offline
      - generic [ref=e8]:
        - generic [ref=e9]:
          - generic [ref=e10]: "Connections:"
          - generic [ref=e11]: "0"
        - generic [ref=e12]:
          - generic [ref=e13]: "Rooms:"
          - generic [ref=e14]: "0"
        - generic [ref=e15]:
          - generic [ref=e16]: "Uptime:"
          - generic [ref=e17]: 0h 0m 0s
      - button "Logout" [ref=e18] [cursor=pointer]
    - generic [ref=e19] [cursor=pointer]: "Connection error: websocket error (click to dismiss)"
    - generic [ref=e20]:
      - button "Rooms (0)" [ref=e21] [cursor=pointer]
      - button "Errors (0)" [ref=e22] [cursor=pointer]
      - button "Events (0)" [ref=e23] [cursor=pointer]
    - generic [ref=e24]:
      - complementary [ref=e25]:
        - heading "Active Rooms (0)" [level=2] [ref=e26]
        - generic [ref=e27]:
          - text: Connecting to server...
          - button "Retry" [ref=e28] [cursor=pointer]
      - main [ref=e29]:
        - paragraph [ref=e31]: Select a room to view details
  - generic [ref=e32] [cursor=pointer]: Reconnecting to server...
```