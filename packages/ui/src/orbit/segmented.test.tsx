import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Segmented } from "./segmented";

const options = [
  { value: "board", label: "Board" },
  { value: "list", label: "List" },
  { value: "calendar", label: "Calendar" },
];

function Harness({ onChange }: { onChange?: (v: string) => void }) {
  const [value, setValue] = useState("board");
  return (
    <Segmented
      label="View"
      options={options}
      value={value}
      onChange={(v) => {
        setValue(v);
        onChange?.(v);
      }}
    />
  );
}

describe("Segmented (system §6.4)", () => {
  it("is a radio group with aria-checked on the selected option and one tab stop", () => {
    render(<Harness />);
    const group = screen.getByRole("radiogroup", { name: "View" });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Board" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "List" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("radio", { name: "Board" })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("radio", { name: "List" })).toHaveAttribute("tabindex", "-1");
  });

  it("arrow keys move selection and focus, wrapping at the ends", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const board = screen.getByRole("radio", { name: "Board" });
    board.focus();
    fireEvent.keyDown(board, { key: "ArrowRight" });
    const list = screen.getByRole("radio", { name: "List" });
    expect(onChange).toHaveBeenLastCalledWith("list");
    expect(list).toHaveAttribute("aria-checked", "true");
    expect(list).toHaveFocus();
    fireEvent.keyDown(list, { key: "ArrowLeft" });
    fireEvent.keyDown(screen.getByRole("radio", { name: "Board" }), { key: "ArrowLeft" });
    expect(screen.getByRole("radio", { name: "Calendar" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Calendar" })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("radio", { name: "Calendar" }), { key: "ArrowDown" });
    expect(screen.getByRole("radio", { name: "Board" })).toHaveAttribute("aria-checked", "true");
  });

  it("Home and End jump; clicking selects", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole("radio", { name: "Board" }), { key: "End" });
    expect(onChange).toHaveBeenLastCalledWith("calendar");
    fireEvent.keyDown(screen.getByRole("radio", { name: "Calendar" }), { key: "Home" });
    expect(onChange).toHaveBeenLastCalledWith("board");
    fireEvent.click(screen.getByRole("radio", { name: "List" }));
    expect(onChange).toHaveBeenLastCalledWith("list");
  });
});
