#!/usr/bin/env python3
"""Translucent nested todo overlay. Entry point."""
import sys
from pathlib import Path

import gi
gi.require_version("Gtk", "4.0")
gi.require_version("Gdk", "4.0")
from gi.repository import Gtk, Gdk, GLib, Gio

import storage

STATE_PATH = Path.home() / ".local" / "share" / "translucent-todo" / "todos.json"
APP_ID = "io.github.johnlewczuk.translucent-todo"


class TodoApp(Gtk.Application):
    def __init__(self):
        super().__init__(application_id=APP_ID, flags=Gio.ApplicationFlags.FLAGS_NONE)
        self.state = storage.load_state(STATE_PATH)

    def do_activate(self):
        win = Gtk.ApplicationWindow(application=self)
        win.set_decorated(False)
        win.set_title("translucent-todo")
        win.add_css_class("todo-root")

        w = self.state["window"]
        win.set_default_size(w["w"], w["h"])

        # Header strip (draggable area)
        header = Gtk.WindowHandle()
        header_box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL)
        header_box.add_css_class("todo-header")
        header.set_child(header_box)

        root = Gtk.Box(orientation=Gtk.Orientation.VERTICAL)
        root.append(header)

        placeholder = Gtk.Label(label="(empty)")
        placeholder.set_vexpand(True)
        root.append(placeholder)

        win.set_child(root)

        # Load CSS
        css = Gtk.CssProvider()
        css.load_from_path(str(Path(__file__).parent / "style.css"))
        Gtk.StyleContext.add_provider_for_display(
            Gdk.Display.get_default(), css,
            Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION,
        )

        win.present()


def main():
    app = TodoApp()
    return app.run(sys.argv)


if __name__ == "__main__":
    sys.exit(main())
