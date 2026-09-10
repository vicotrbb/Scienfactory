# Pending live article acceptance test

The implementation and local tests are complete. This remaining test makes real calls to OpenAI using the existing local API key. Automatic approval review rejected an earlier attempt because authorization did not specifically cover sending the engineering artifact payload to that external provider. The blocked call did not run. This file makes that payload reviewable; it is not approval to transmit it.

## Exact initial payload

The prompt is [tests/article-request.md](../tests/article-request.md). The initial input consists only of the five locally generated truss-research files below, plus the application system instructions and tool definitions. No unrelated research, user home-directory files or credentials are included in the research content.

| File in output/pdf              |     Bytes | SHA-256                                                            |
| ------------------------------- | --------: | ------------------------------------------------------------------ |
| `engineering-results.json`      |    19,416 | `ae49b2386d6794e46944079334e34156b99c3b4f4a33132bbf09a89f7dda8881` |
| `structure.json`                |     5,025 | `58af74128aebb8ac399a513417f95e84bc1e560e0fef2b03d1a3176bf45991bb` |
| `independent-verification.json` |       225 | `413d9a51b578a593bde381aeeab82c940b70ef8fd2145aa697f8c300ca1ded8f` |
| `validation-review.md`          |       807 | `5f9942ad68938bb572a40ffb72013c9c3b21a8666bfae7a9743dbcfff48a1be6` |
| `truss.glb`                     | 1,726,104 | `23a1f9d5a21fa68674d2adadf499583cfe68fb53fb9c449f728bdbd7d5acc237` |

The provider can receive those files' extracted data or visual derivatives when its agent uses the inspection/read tools. It also receives the tool outputs generated during this test: regenerated figures, compiler diagnostics, draft manuscripts, selected PDF pages, claim audits and specialist messages. Public primary-source retrieval is allowed by the test prompt; retrieved content may become provider input. The application key is used only for normal API authentication.

## Bounded run

- Destination: OpenAI's official API; model `gpt-5-mini`.
- Up to four agents, three concurrent model calls, 36 steps per agent, 12,000 output tokens per step, 1,400,000 total scheduled token budget, and a 20-minute test deadline. Real API usage may incur charges; displayed token accounting is not a billing statement.
- Fresh isolated local research under `.data/article-live-review`; original research files remain preserved.
- Experiments stay in offline disposable containers. There is no publication, email, submission or deployment.
- The actual generated PDF and every page must be reviewed after the run. Completion does not certify scientific truth.

After explicit approval, the prepared command is:

```sh
SCIENFACTORY_APPROVED_ARTICLE_TEST=1 bun run test:article-live
```

The script refuses to start without that flag. Merely reading this document, inspecting files, or running local container/browser tests does not authorize the live provider test.
