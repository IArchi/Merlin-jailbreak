import io
import os
import time
import uuid
import base64
import argparse
from pathlib import Path

bytezero = b'\x00'
info = b"ChouetteRadio"

def read_merlin_playlist(stream):
    items = []
    while (b:=stream.read(2)):

        item = dict()
        # id
        if not b: raise Exception("wrong file format")
        item['id'] = int.from_bytes(b, byteorder='little')

        # id du parent
        b = stream.read(2)
        if not b: raise Exception("wrong file format")
        item['parent_id'] = int.from_bytes(b, byteorder='little')

        # ordre
        b = stream.read(2)
        if not b: raise Exception("wrong file format")
        item['order'] = int.from_bytes(b, byteorder='little')

        # nb_enfants
        b = stream.read(2)
        if not b: raise Exception("wrong file format")
        item['nb_children'] = int.from_bytes(b, byteorder='little')

        # ordre dans les favoris
        b = stream.read(2)
        if not b: raise Exception("wrong file format")
        item['fav_order'] = int.from_bytes(b, byteorder='little')

        # type d'item
        b = stream.read(2)
        if not b: raise Exception("wrong file format")
        item['type'] = int.from_bytes(b, byteorder='little')

        # date limite
        b = stream.read(4)
        if not b: raise Exception("wrong file format")
        item['limit_time'] = int.from_bytes(b, byteorder='little')

        # date d'ajout
        b = stream.read(4)
        if not b: raise Exception("wrong file format")
        item['add_time'] = int.from_bytes(b, byteorder='little')

        # uuid (nom de fichier)
        b = stream.read(1)
        if not b: raise Exception("wrong file format")
        length = int.from_bytes(b, byteorder='little')
        b = stream.read(length)
        item['uuid'] = b.decode('UTF-8')
        b = stream.read(64-length)

        # titre
        b = stream.read(1)
        if not b: raise Exception("wrong file format")
        length = int.from_bytes(b, byteorder='little')
        b = stream.read(length)
        item['title'] = b.decode('UTF-8')
        b = stream.read(66-length)

        items.append(item)
    return items

def write_merlin_playlist(stream, items):
    for item in items:

        # id
        b = item['id'].to_bytes(2,byteorder='little')
        stream.write(b)

        # id du parent
        b = item['parent_id'].to_bytes(2, byteorder='little')
        stream.write(b)

        # ordre
        b = item['order'].to_bytes(2, byteorder='little')
        stream.write(b)

        # nb_enfants
        b = item['nb_children'].to_bytes(2, byteorder='little')
        stream.write(b)

        # ordre dans les favoris
        b = item['fav_order'].to_bytes(2, byteorder='little')
        stream.write(b)

        # type d'item
        b = item['type'].to_bytes(2, byteorder='little')
        stream.write(b)

        # date limite
        b = item['limit_time'].to_bytes(4, byteorder='little')
        stream.write(b)

        # date d'ajout
        b = item['add_time'].to_bytes(4, byteorder='little')
        stream.write(b)

        # uuid (nom de fichier)
        b = item['uuid'].encode('UTF-8')
        length = len(b)
        length_b = length.to_bytes(1, byteorder='little')
        stream.write(length_b)
        stream.write(b)
        stream.write(bytezero*(64-length))

        # titre
        b = item['title'].encode('UTF-8')
        length = len(b)
        length_b = length.to_bytes(1, byteorder='little')
        stream.write(length_b)
        stream.write(b)
        stream.write(bytezero*(66-length))

def build_hierarchy(items):
    # Step 1: Create a dictionary of items by their id
    item_dict = {item['id']: item for item in items}

    # Step 2: Add a 'children' key to all items
    for item in item_dict.values():
        item['children'] = []

    # Step 3: Build the hierarchy
    hierarchy = {}

    for item in items:
        parent_id = item['parent_id']
        if parent_id == 0:
            # If the item is a root, add it to the hierarchy
            hierarchy[item['id']] = item
        else:
            # Otherwise, add it to its parent's children list
            parent = item_dict.get(parent_id)
            if parent:
                parent['children'].append(item)

    return hierarchy

def flatten_hierarchy(hierarchy):
    # Step 1: Initialize an empty list to hold flattened items
    flattened = []

    # Step 2: Define a recursive function to traverse the hierarchy
    def traverse(item):
        # Make a copy of the item so we can remove the 'children' key
        item_copy = item.copy()
        # Remove 'children' from the copied item
        children = item_copy.pop('children', [])
        # Append the item to the flattened list
        flattened.append(item_copy)
        # Step 3: Recursively process each child
        for child in children:
            traverse(child)

    # Step 4: Traverse each root node in the hierarchy
    for root_id, root_item in hierarchy.items():
        traverse(root_item)

    return flattened

def print_hierarchy(node, level=0):
    indent = ' ' * 4 * level  # Indentation based on level
    prefix = '|-- ' if level > 0 else ''  # Prefix to indicate tree branch
    # Print the current node
    if node['type'] == 4: print(f"{indent}{prefix}{node['title']} (id: {node['id']}, files: {node['uuid']})")
    else: print(f"{indent}{prefix}{node['title']} (id: {node['id']}, children: {node['nb_children']})")

    # Recursively print children with increased level
    for child in node.get('children', []):
        print_hierarchy(child, level + 1)

def read(stream, dirname):
    items = read_merlin_playlist(stream)
    for item in items:
        if item['type'] == 1: # root
            item['imagepath'] = ''
        else:
            item['imagepath'] = os.path.join(dirname, item['uuid'] + '.jpg')
        if item['type'] in [4, 36]:
            soundpath = os.path.join(dirname, item['uuid'] + '.mp3')
            item['soundpath'] = soundpath
        else:
            item['soundpath'] = ''
    return items

def get_item_by_id(items, id):
    for item in items:
        if item['id'] == id: return item
    return None

def get_confirmation(prompt):
    while True:
        response = input(prompt).strip().lower()
        if response in {'y', 'n', ''}:
            return response
        else:
            print("Please enter 'Y' for Yes or 'N' for No.")

def write_upload_thumbnail(destfile):
    base64_string = '''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'''

    image_data = base64.b64decode(base64_string)
    with open(destfile, "wb") as file: file.write(image_data)

def main():
    # Parse arguments
    parser = argparse.ArgumentParser(description='Read, add, delete sounds from Merlin musicbox.')
    parser.add_argument('filename', type=str, help='the binary file name to process (playlist.bin)')
    parser.add_argument('-r', '--raw', action='store_true', help='Show raw playlist')
    parser.add_argument('-d', '--discover', action='store_true', help='Explore current directory to find added and removed files')
    args = parser.parse_args()

    # Check if the file exists
    if not Path(args.filename).exists():
        print(f"[ERROR] Playlist '{args.filename}' does not exist.")
        return

    # Parse directory
    absolute_path = os.path.abspath(args.filename)
    dirname = os.path.dirname(absolute_path)
    mp3_files = [f for f in os.listdir(dirname) if f.endswith('.mp3')]

    # Read playlist
    items = []
    with open(args.filename, "rb") as file: items = read(file, dirname)

    # Print current playlist
    if not args.discover:
        print('Current playlist:')
        if args.raw:
            for item in items: print(item)
        else:
            hierarchy = build_hierarchy(items)
            for root_id, root_item in hierarchy.items():
                print_hierarchy(root_item)
        return

    # Check differences between playlist and repository
    else:
        # Extract id values from both lists
        pIds = {item['uuid'] for item in items if len(item['uuid']) and item['type'] == 4}
        sIds = {f[:-len('.mp3')] for f in mp3_files}
        last_id = max(item['id'] for item in items)

        # Find new and removed sounds
        new_sounds = sIds - pIds
        removed_sounds = pIds - sIds

        # Recover items
        removed_items = [item for item in items if item['uuid'] in removed_sounds]

        print('> ', len(new_sounds), 'new sounds found')
        for sound in new_sounds:
            print(f" - [A] {sound}")
        print('> ', len(removed_items), 'sounds have been removed')
        for item in removed_items:
            print(f" - [D] {item['title']}")

        confirmation = get_confirmation("Hit enter to simulate the new playlist (Y/n): ")
        if confirmation not in {'y', ''}: return

        # Hack to get unlimited use time
        for item in items:
            if item['type'] != 4: continue
            item['limit_time'] = 0

        # Retrive upload folder
        upload_parent = None
        for item in items:
            if item['title'] != 'Upload': continue
            upload_parent = item
            break

        # Create upload folder
        if upload_parent is None:
            root = get_item_by_id(items, 1)
            if root is None:
                print('[ERROR] Cannot find root node. Exit')
                return

            # Store source to destination
            rename_to = {}

            # Create folder
            last_id += 1
            upload_id = last_id
            upload_uuid = str(uuid.uuid4())
            upload_parent = {
                'id': upload_id,
                'parent_id': 1,
                'order': root['nb_children'],
                'nb_children': 0,
                'fav_order': 0,
                'type': 2,
                'limit_time': 0,
                'add_time': 0,
                'uuid': upload_uuid,
                'title': 'Upload',
                'imagepath': os.path.join(dirname, upload_uuid + '.jpg'),
                'soundpath': ''
            }
            items.append(upload_parent)

            # Increment nb_children of root
            root['nb_children'] += 1

        # Build added items
        new_items = []
        for new in new_sounds:
            # Check if files are present
            imagepath = os.path.join(dirname, new + '.jpg')
            soundpath = os.path.join(dirname, new + '.mp3')
            if not Path(imagepath).exists():
                print(f'[WARN] Thumbnail is missing for {new}. Skipping...')
                continue

            # Convert to UUID
            song_uuid = str(uuid.uuid4())
            rename_to[imagepath] = os.path.join(dirname, song_uuid + '.jpg')
            rename_to[soundpath] = os.path.join(dirname, song_uuid + '.mp3')

            # Ask for title
            title = input(f"Enter title for sound {new}: ")
            if len(title) == 0: continue
            last_id += 1
            new_items.append({
                'id': last_id,
                'parent_id': upload_parent['id'],
                'order': upload_parent['nb_children'],
                'nb_children': 0,
                'fav_order': 0,
                'type': 4,
                'limit_time': 0,
                'add_time': int(time.time()),
                'uuid': song_uuid,
                'title': title,
                'imagepath': os.path.join(dirname, song_uuid + '.jpg'),
                'soundpath': os.path.join(dirname, song_uuid + '.mp3')
            })
            upload_parent['nb_children'] += 1

        # Remove deleted items from playlist (and from their parent)
        items = [item for item in items if item['uuid'] not in removed_sounds]

        # Update parent nb_children
        for i in removed_items:
            p = get_item_by_id(items, i['parent_id'])
            if p is None: continue
            p['nb_children'] -= 1

            # Clear empty parent (only first level to keep original hierarchy)
            if p['nb_children'] == 0: items.remove(p)

        # Add new items
        items = items + new_items

        # Show new playlist before confirmation
        hierarchy = build_hierarchy(items)
        for root_id, root_item in hierarchy.items():
            print_hierarchy(root_item)

        # Ask user confirmation
        confirmation = get_confirmation("Do you want to write the new playlist ? (Y/n): ")
        if confirmation not in {'y', ''}: return

        # Create backup
        now = int(time.time())
        backup_file = f"backup_{now}.bin"
        with open(args.filename, 'rb') as src, open(os.path.join(dirname, backup_file), 'wb') as dst: dst.write(src.read())

        # Rename files
        write_upload_thumbnail(os.path.join(dirname, upload_uuid + '.jpg'))
        for k, v in rename_to.items(): os.rename(k, v)

        # Write to file
        with open(args.filename, "wb") as file: write_merlin_playlist(file, items)
        print('Done !')

if __name__ == "__main__":
    main()
