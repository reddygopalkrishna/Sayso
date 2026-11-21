# Benchmark: 22 recordings from /Users/reddygopalkrishna/code/Sayso/scripts/benchmark/sample

Cleanup: local rules only (no AI).

## Dictation (10 recordings)

| Measure | Plain Whisper | Sayso |
|---|---|---|
| Word error rate (lower is better) | 11.9% | 8.1% |
| Indian names and entities spelled exactly (15 expected) | 10 (66.7%) | 10 (66.7%) |
| Filler words left (6 said) | 3 | 0 |
| Median speech-to-text time | 542 ms | same |

| File | Expected | Plain Whisper | Sayso | Cleanup |
|---|---|---|---|---|
| d01.wav | I will meet Priya in Hyderabad tomorrow. | Um I will meet Priya in Hyderabad tomorrow. | I will meet Priya in Hyderabad tomorrow. | light |
| d02.wav | Please send the report to Srinivas by 5 p.m. | Please send the report to Srinivas by 5 p.m. | Please send the report to Srinivas by 5 p.m. | light |
| d03.wav | We are flying from Bengaluru to Mumbai on Friday. | We are flying from Bengaluru to Mumbai on Friday. | We are flying from Bengaluru to Mumbai on Friday. | light |
| d04.wav | Lakshmi asked me to open GitHub and check the pull request. | Um Lakshmiya asked me to open Jithub and check the pull request. | Lakshmiya asked me to open Jithub and check the pull request. | light |
| d05.wav | The meeting with Keshav is in Secunderabad at noon. | The meeting with Keshav is in Sikhangrabad at noon. | The meeting with Keshav is in Sikhangrabad at noon. | light |
| d06.wav | I think we should ask ChatGPT about it. | I think we should ask ChatGPT about it. | I think we should ask ChatGPT about it. | light |
| d07.wav | Can you share the link on WhatsApp? | Can you share the link on Vharts app? | Can you share the link on Vharts app? | light |
| d08.wav | Go to openai.com and sign in. | Um go to openai.com and sign in. | Go to openai.com and sign in. | light |
| d09.wav | Deepa and Akhilesh are travelling to Chennai next week. | Deepar and Akhilesh are travelling to Chennai next week. | Deepar and Akhilesh are travelling to Chennai next week. | light |
| d10.wav | Let us have lunch in Pune on Sunday. | Hum let us have lunch in Pune on Sunday. | Hum let us have lunch in Pune on Sunday. | light |

## Commands (12 recordings)

| How it is understood | Success |
|---|---|
| Plain Whisper text, exact grammar | 7/12 (58.3%) |
| Sayso (names applied), exact grammar and close mishearings | 7/12 (58.3%) |
| Sayso with the interpreter | not run (add --ai and a key in .env) |

| File | Said | Heard | Wanted | Exact | Interpreter |
|---|---|---|---|---|---|
| c01.wav | new tab |  | new_tab | no | - |
| c02.wav | close tab |  | close_tab | no | - |
| c03.wav | go back |  | go_back | no | - |
| c04.wav | scroll down | Scroll down. | scroll_down | yes | - |
| c05.wav | scroll up |  | scroll_up | no | - |
| c06.wav | select all | Select all. | select_all | yes | - |
| c07.wav | undo that |  | undo | no | - |
| c08.wav | click sign in | Click Sign In. | click | yes | - |
| c09.wav | open the first result | Open the first result. | open_position | yes | - |
| c10.wav | open Chrome | Open Chrome. | open | yes | - |
| c11.wav | switch to Slack | Switch to Slack | switch_app | yes | - |
| c12.wav | take a screenshot | Take a screenshot | screenshot | yes | - |

