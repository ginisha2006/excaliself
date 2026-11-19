import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react"
import type { DragEvent, ReactNode } from "react"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import type { Space } from "@/db/schema"
import { useFileDropTarget } from "./import-files"

const { importDrawingFile } = vi.hoisted(() => ({
  importDrawingFile: vi.fn(),
}))

vi.mock("@tanstack/react-start", () => ({
  createClientOnlyFn: (fn: () => unknown) => fn,
}))

vi.mock("@excalidraw/excalidraw", () => ({
  loadFromBlob: vi.fn(async () => ({
    elements: [],
    appState: {},
    files: {},
  })),
  serializeAsJSON: vi.fn(() =>
    JSON.stringify({ elements: [], appState: {}, files: {} }),
  ),
}))

vi.mock("./server", () => ({
  getDrawingScene: vi.fn(),
  getDrawings: vi.fn(),
  getDrawingWithFiles: vi.fn(),
  importDrawingFile,
}))

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    loading: vi.fn(() => "toast-1"),
    success: vi.fn(),
  },
}))

function DropZone({
  target,
}: {
  target: { folderId: string | null; space: Space }
}) {
  const { isOver, onDragOver, onDragLeave, onDrop } = useFileDropTarget(target)

  return (
    <div
      data-testid="drop-zone"
      data-over={isOver}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <button type="button" data-testid="child">
        Child
      </button>
    </div>
  )
}

function renderDropZone(
  target = { folderId: "folder-1", space: "team" as const },
) {
  const queryClient = new QueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return render(<DropZone target={target} />, { wrapper })
}

const file = new File(["{}"], "Plan.excalidraw")
const fileTransfer = (files: File[]) => ({
  types: ["Files"],
  files,
  dropEffect: "",
})

beforeEach(() => {
  vi.clearAllMocks()
  importDrawingFile.mockResolvedValue({ skippedImages: 0 })
})

afterEach(() => {
  cleanup()
})

test("imports external files into the configured target and clears highlighting after drop", async () => {
  renderDropZone()
  const zone = screen.getByTestId("drop-zone")
  const dataTransfer = fileTransfer([file])

  fireEvent.dragOver(zone, { dataTransfer })
  expect(zone.getAttribute("data-over")).toBe("true")

  fireEvent.drop(zone, { dataTransfer })

  expect(zone.getAttribute("data-over")).toBe("false")
  await waitFor(() =>
    expect(importDrawingFile).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: "Plan",
        folderId: "folder-1",
        space: "team",
      }),
    }),
  )
})

test("non-file drags are not accepted", () => {
  renderDropZone()
  const zone = screen.getByTestId("drop-zone")
  const dataTransfer = {
    types: ["text/plain"],
    files: [],
    dropEffect: "",
  }

  expect(fireEvent.dragOver(zone, { dataTransfer })).toBe(true)
  fireEvent.drop(zone, { dataTransfer })

  expect(zone.getAttribute("data-over")).toBe("false")
  expect(importDrawingFile).not.toHaveBeenCalled()
})

test("an empty file drop clears highlighting without importing", () => {
  renderDropZone()
  const zone = screen.getByTestId("drop-zone")
  const dataTransfer = fileTransfer([])

  fireEvent.dragOver(zone, { dataTransfer })
  expect(zone.getAttribute("data-over")).toBe("true")
  fireEvent.drop(zone, { dataTransfer })

  expect(zone.getAttribute("data-over")).toBe("false")
  expect(importDrawingFile).not.toHaveBeenCalled()
})

test("moving over a child does not clear highlighting, but leaving the zone does", () => {
  const queryClient = new QueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  const { result } = renderHook(
    () => useFileDropTarget({ folderId: "folder-1", space: "team" }),
    { wrapper },
  )
  const zone = document.createElement("div")
  const child = document.createElement("button")
  zone.append(child)

  act(() =>
    result.current.onDragOver({
      currentTarget: zone,
      dataTransfer: fileTransfer([file]),
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as DragEvent),
  )
  expect(result.current.isOver).toBe(true)

  act(() =>
    result.current.onDragLeave({
      currentTarget: zone,
      relatedTarget: child,
    } as unknown as DragEvent),
  )
  expect(result.current.isOver).toBe(true)

  act(() =>
    result.current.onDragLeave({
      currentTarget: zone,
      relatedTarget: null,
    } as unknown as DragEvent),
  )
  expect(result.current.isOver).toBe(false)
})
