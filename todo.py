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
        self._save_source = 0

    def schedule_save(self):
        if self._save_source:
            GLib.source_remove(self._save_source)
        self._save_source = GLib.timeout_add(250, self._do_save)

    def _do_save(self):
        self._save_source = 0
        storage.save_state(STATE_PATH, self.state)
        return False  # one-shot

    def _selected_path(self) -> list[int] | None:
        """Compute the path (list of indices) of the currently selected node."""
        pos = self.selection.get_selected()
        if pos == Gtk.INVALID_LIST_POSITION:
            return None
        row = self.tree_model.get_row(pos)
        # Walk up via TreeListRow.get_parent() to build path of child indices
        path = []
        current = row
        while current is not None:
            parent = current.get_parent()
            if parent is None:
                # current is at root - find its index in root items
                node = current.get_item().node
                items = self.state["items"]
                path.insert(0, items.index(node))
                break
            else:
                parent_node = parent.get_item().node
                node = current.get_item().node
                path.insert(0, parent_node["children"].index(node))
                current = parent
        return path

    def _refresh(self):
        """Rebuild the tree model after a structural change."""
        root_store = Gio.ListStore.new(self.NodeObject)
        for n in self.state["items"]:
            root_store.append(self.NodeObject(n))

        def create_child_model(item):
            node = item.node
            if not node["children"]:
                return None
            child_store = Gio.ListStore.new(self.NodeObject)
            for c in node["children"]:
                child_store.append(self.NodeObject(c))
            return child_store

        self.tree_model = Gtk.TreeListModel.new(
            root_store, passthrough=False, autoexpand=False,
            create_func=create_child_model,
        )
        self.selection.set_model(self.tree_model)

    def _focus_path(self, path: list[int] | None):
        """Move selection to the node at `path` after a mutation."""
        if path is None:
            return
        target_node = self.state["items"][path[0]]
        for idx in path[1:]:
            target_node = target_node["children"][idx]
        n = self.tree_model.get_n_items()
        for i in range(n):
            row = self.tree_model.get_row(i)
            if row.get_item().node is target_node:
                self.selection.set_selected(i)
                return

    def do_activate(self):
        win = Gtk.ApplicationWindow(application=self)
        win.set_decorated(False)
        win.set_title("translucent-todo")
        win.add_css_class("todo-root")

        w = self.state["window"]
        win.set_default_size(w["w"], w["h"])

        def on_close_request(w):
            width, height = w.get_default_size()
            self.state["window"] = {
                "x": self.state["window"].get("x", 100),
                "y": self.state["window"].get("y", 100),
                "w": width, "h": height,
            }
            storage.save_state(STATE_PATH, self.state)
            return False
        win.connect("close-request", on_close_request)

        # Header strip (draggable area)
        header = Gtk.WindowHandle()
        header_box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL)
        header_box.add_css_class("todo-header")
        header.set_child(header_box)

        root = Gtk.Box(orientation=Gtk.Orientation.VERTICAL)
        root.append(header)

        # Build tree model from state["items"]
        from gi.repository import GObject

        class NodeObject(GObject.Object):
            __gtype_name__ = "NodeObject"

            def __init__(self, node):
                super().__init__()
                self.node = node  # the dict

        self.NodeObject = NodeObject

        def build_store(items):
            store = Gio.ListStore.new(NodeObject)
            for n in items:
                store.append(NodeObject(n))
            return store

        def create_child_model(item):
            node = item.node
            if not node["children"]:
                return None
            return build_store(node["children"])

        root_store = build_store(self.state["items"])
        self.tree_model = Gtk.TreeListModel.new(
            root_store,
            passthrough=False,
            autoexpand=False,
            create_func=create_child_model,
        )

        selection = Gtk.SingleSelection.new(self.tree_model)

        def setup_row(_factory, list_item):
            expander = Gtk.TreeExpander()
            box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=6)
            check = Gtk.CheckButton()
            label = Gtk.Label(xalign=0)
            label.set_hexpand(True)
            box.append(check)
            box.append(label)
            expander.set_child(box)
            list_item.set_child(expander)

        def bind_row(_factory, list_item):
            row = list_item.get_item()  # Gtk.TreeListRow
            node_obj = row.get_item()
            node = node_obj.node
            expander = list_item.get_child()
            expander.set_list_row(row)
            # Sync persisted collapsed state into the row's expansion
            row.set_expanded(not node["collapsed"])
            # Track changes back to the node
            if hasattr(row, "_notify_handler") and row._notify_handler:
                row.disconnect(row._notify_handler)
            def on_expanded_changed(r, _pspec, n=node):
                n["collapsed"] = not r.get_expanded()
                self.schedule_save()
            row._notify_handler = row.connect("notify::expanded", on_expanded_changed)
            box = expander.get_child()
            check = box.get_first_child()
            label = check.get_next_sibling()
            label.set_text(node["text"] or "(empty)")
            check.set_active(node["done"])
            # Disconnect any previous handler before connecting a new one
            if hasattr(check, "_handler_id") and check._handler_id:
                check.disconnect(check._handler_id)
            def on_toggled(_btn, n=node):
                n["done"] = not n["done"]
                if n["done"]:
                    label.add_css_class("done")
                else:
                    label.remove_css_class("done")
                self.schedule_save()
            check._handler_id = check.connect("toggled", on_toggled)
            if node["done"]:
                label.add_css_class("done")
            else:
                label.remove_css_class("done")

        factory = Gtk.SignalListItemFactory()
        factory.connect("setup", setup_row)
        factory.connect("bind", bind_row)

        list_view = Gtk.ListView.new(selection, factory)
        list_view.set_vexpand(True)
        list_view.add_css_class("todo-list")

        scroller = Gtk.ScrolledWindow()
        scroller.set_child(list_view)
        scroller.set_vexpand(True)
        root.append(scroller)

        self.list_view = list_view
        self.selection = selection

        key_ctrl = Gtk.EventControllerKey()
        def on_key(_ctrl, keyval, _keycode, mod):
            import tree
            path = self._selected_path()
            shift = bool(mod & Gdk.ModifierType.SHIFT_MASK)

            if keyval == Gdk.KEY_Return and path is not None:
                new_path = tree.add_sibling_after(self.state["items"], path)
                self._refresh()
                self._focus_path(new_path)
                self.schedule_save()
                return True
            if keyval == Gdk.KEY_Tab and path is not None:
                new_path = tree.indent(self.state["items"], path)
                self._refresh()
                self._focus_path(new_path or path)
                self.schedule_save()
                return True
            if keyval == Gdk.KEY_ISO_Left_Tab and path is not None:
                # Shift+Tab on X11
                new_path = tree.outdent(self.state["items"], path)
                self._refresh()
                self._focus_path(new_path or path)
                self.schedule_save()
                return True
            if keyval == Gdk.KEY_space and path is not None:
                tree.toggle_done(self.state["items"], path)
                self._refresh()
                self._focus_path(path)
                self.schedule_save()
                return True
            if keyval == Gdk.KEY_Delete and path is not None:
                new_path = tree.delete(self.state["items"], path)
                self._refresh()
                self._focus_path(new_path)
                self.schedule_save()
                return True
            return False
        key_ctrl.connect("key-pressed", on_key)
        win.add_controller(key_ctrl)

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
