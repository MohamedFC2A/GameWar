extends Node2D

const PLAYER_COLOR := Color(0.2, 0.62, 0.95, 1.0)
const ENEMY_COLORS := {
	"grunt": Color(0.90, 0.82, 0.28, 1.0),
	"striker": Color(0.92, 0.50, 0.20, 1.0),
	"sniper": Color(0.72, 0.32, 0.92, 1.0),
	"boss": Color(0.86, 0.16, 0.22, 1.0)
}

enum State { MAIN_MENU, LOADING, PLAYING, UPGRADE, DEFEAT }

var state: State = State.MAIN_MENU
var profile: Dictionary = {}
var player_stats: Dictionary = {}
var player: TankEntity
var camera: Camera2D
var world: Node2D
var obstacle_root: Node2D
var ui_layer: CanvasLayer
var top_panel: PanelContainer
var hud_box: VBoxContainer
var stage_label: Label
var wave_label: Label
var coin_label: Label
var hp_label: Label
var status_label: Label
var details_label: Label
var auto_aim_btn: Button
var boss_warning_label: Label
var boss_warning_timer := 0.0
var upgrade_panel: PanelContainer
var upgrade_list: HBoxContainer
var defeat_panel: PanelContainer
var touch_hint: Label
var main_menu_panel: PanelContainer
var menu_battle_btn: Button
var menu_stats_label: Label

var current_stage: Dictionary = {}
var active_enemies: Array = []
var spawn_token := 0
var spawn_finished := false
var current_upgrade_choices: Array = []

var move_touch_index := -1
var fire_touch_index := -1
var move_axis := Vector2.ZERO
var aim_axis := Vector2.ZERO
var fire_held := false

# Virtual Joysticks
var VirtualJoystickClass = load("res://scripts/virtual_joystick.gd")
var left_joystick: Control
var right_joystick: Control

# Camera Shake
var shake_intensity := 0.0
var shake_decay := 14.0

func _ready() -> void:
	randomize()
	profile = SaveSystem.load_profile()
	player_stats = GameData.player_base_stats()
	for owned_id in profile.get("unlocked_upgrades", []):
		var upgrade: Dictionary = _find_upgrade_by_id(owned_id)
		if upgrade:
			player_stats = GameData.apply_upgrade(player_stats, upgrade)

	_build_world()
	_build_ui()
	_spawn_player()
	call_deferred("_enter_main_menu")

func get_arena_half_size() -> float:
	return 520.0

func _start_campaign() -> void:
	start_stage(int(profile.get("stage_index", 1)))

func _build_world() -> void:
	world = Node2D.new()
	world.name = "World"
	add_child(world)

	obstacle_root = Node2D.new()
	obstacle_root.name = "Obstacles"
	world.add_child(obstacle_root)

	camera = Camera2D.new()
	camera.position = Vector2.ZERO
	add_child(camera)
	camera.make_current()

	var floor: Polygon2D = Polygon2D.new()
	floor.polygon = PackedVector2Array([
		Vector2(-540, -540),
		Vector2(540, -540),
		Vector2(540, 540),
		Vector2(-540, 540)
	])
	floor.color = Color(0.08, 0.09, 0.11, 1.0)
	floor.z_index = -10000
	world.add_child(floor)

	# Spawn floor grid
	var grid := FloorGrid.new()
	grid.z_index = -9999
	world.add_child(grid)

	_create_wall(Vector2(0, -540), Vector2(1080, 24))
	_create_wall(Vector2(0, 540), Vector2(1080, 24))
	_create_wall(Vector2(-540, 0), Vector2(24, 1080))
	_create_wall(Vector2(540, 0), Vector2(24, 1080))

func _build_ui() -> void:
	ui_layer = CanvasLayer.new()
	add_child(ui_layer)

	# Root control node
	var hud_root := Control.new()
	hud_root.name = "HUDRoot"
	hud_root.anchor_left = 0.0
	hud_root.anchor_top = 0.0
	hud_root.anchor_right = 1.0
	hud_root.anchor_bottom = 1.0
	ui_layer.add_child(hud_root)

	# StyleBox for glassmorphism panels
	var panel_style := StyleBoxFlat.new()
	panel_style.bg_color = Color(0.08, 0.1, 0.14, 0.85)
	panel_style.border_width_left = 2
	panel_style.border_width_top = 2
	panel_style.border_width_right = 2
	panel_style.border_width_bottom = 2
	panel_style.border_color = Color(0.2, 0.62, 0.95, 0.8)
	panel_style.corner_radius_top_left = 12
	panel_style.corner_radius_top_right = 12
	panel_style.corner_radius_bottom_left = 12
	panel_style.corner_radius_bottom_right = 12
	panel_style.content_margin_left = 16
	panel_style.content_margin_right = 16
	panel_style.content_margin_top = 16
	panel_style.content_margin_bottom = 16
	panel_style.shadow_color = Color(0, 0, 0, 0.4)
	panel_style.shadow_size = 8

	# Top stats panel
	top_panel = PanelContainer.new()
	top_panel.position = Vector2(16, 16)
	top_panel.size = Vector2(280, 270)
	top_panel.add_theme_stylebox_override("panel", panel_style)
	hud_root.add_child(top_panel)

	hud_box = VBoxContainer.new()
	hud_box.add_theme_constant_override("separation", 6)
	top_panel.add_child(hud_box)

	stage_label = _make_label("Stage: -", 20)
	stage_label.add_theme_color_override("font_color", Color(0.2, 0.8, 1.0))
	
	wave_label = _make_label("Wave: 0 / 0", 18)
	wave_label.add_theme_color_override("font_color", Color(0.95, 0.85, 0.1))
	
	coin_label = _make_label("Coins: 0", 18)
	coin_label.add_theme_color_override("font_color", Color(1.0, 0.65, 0.0))
	
	hp_label = _make_label("HP: 0/0", 18)
	hp_label.add_theme_color_override("font_color", Color(0.2, 0.95, 0.35))
	
	status_label = _make_label("Status: Loading", 16)
	
	details_label = _make_label("Use left drag to move, right touch to fire.", 14)
	details_label.add_theme_color_override("font_color", Color(0.7, 0.7, 0.7))
	
	# Auto aim toggle button
	auto_aim_btn = Button.new()
	auto_aim_btn.toggle_mode = true
	auto_aim_btn.button_pressed = true
	auto_aim_btn.text = "Auto-Aim: ON"
	auto_aim_btn.add_theme_color_override("font_color", Color(0.2, 0.95, 0.35))
	auto_aim_btn.toggled.connect(_on_auto_aim_toggled)
	_style_button(auto_aim_btn)

	hud_box.add_child(stage_label)
	hud_box.add_child(wave_label)
	hud_box.add_child(coin_label)
	hud_box.add_child(hp_label)
	hud_box.add_child(status_label)
	hud_box.add_child(details_label)
	hud_box.add_child(auto_aim_btn)

	# Desktop aim/help hint
	touch_hint = _make_label("WASD / Arrows to Move | Mouse to Aim & Shoot\nTouch halves of screen on Mobile for joysticks", 14)
	touch_hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	touch_hint.anchor_left = 0.5
	touch_hint.anchor_top = 1.0
	touch_hint.anchor_right = 0.5
	touch_hint.anchor_bottom = 1.0
	touch_hint.offset_left = -300
	touch_hint.offset_top = -64
	touch_hint.offset_right = 300
	touch_hint.offset_bottom = -16
	hud_root.add_child(touch_hint)

	# Boss warning banner (large flashing text)
	boss_warning_label = Label.new()
	boss_warning_label.text = "⚠️ WARNING: BOSS INCOMING ⚠️"
	boss_warning_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	boss_warning_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	boss_warning_label.add_theme_font_size_override("font_size", 38)
	boss_warning_label.add_theme_color_override("font_color", Color(0.95, 0.15, 0.2))
	boss_warning_label.add_theme_color_override("font_outline_color", Color.BLACK)
	boss_warning_label.add_theme_constant_override("outline_size", 10)
	boss_warning_label.anchor_left = 0.5
	boss_warning_label.anchor_top = 0.3
	boss_warning_label.anchor_right = 0.5
	boss_warning_label.anchor_bottom = 0.3
	boss_warning_label.grow_horizontal = Control.GROW_DIRECTION_BOTH
	boss_warning_label.grow_vertical = Control.GROW_DIRECTION_BOTH
	boss_warning_label.visible = false
	hud_root.add_child(boss_warning_label)

	# Virtual Joysticks
	left_joystick = VirtualJoystickClass.new()
	left_joystick.name = "LeftJoystick"
	hud_root.add_child(left_joystick)

	right_joystick = VirtualJoystickClass.new()
	right_joystick.name = "RightJoystick"
	hud_root.add_child(right_joystick)

	# CenterContainer for menus
	var center_container := CenterContainer.new()
	center_container.anchor_left = 0.0
	center_container.anchor_top = 0.0
	center_container.anchor_right = 1.0
	center_container.anchor_bottom = 1.0
	center_container.mouse_filter = Control.MOUSE_FILTER_IGNORE
	hud_root.add_child(center_container)

	# Upgrade Panel
	upgrade_panel = PanelContainer.new()
	upgrade_panel.visible = false
	upgrade_panel.custom_minimum_size = Vector2(580, 420)
	upgrade_panel.add_theme_stylebox_override("panel", panel_style)
	center_container.add_child(upgrade_panel)

	var upgrade_root := VBoxContainer.new()
	upgrade_root.add_theme_constant_override("separation", 12)
	upgrade_panel.add_child(upgrade_root)

	var upgrade_title := _make_label("CHOOSE AN UPGRADE", 24)
	upgrade_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	upgrade_title.add_theme_color_override("font_color", Color(0.2, 0.8, 1.0))
	upgrade_root.add_child(upgrade_title)

	var upgrade_note := _make_label("Select a battle modification to proceed.", 14)
	upgrade_note.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	upgrade_root.add_child(upgrade_note)

	upgrade_list = HBoxContainer.new()
	upgrade_list.alignment = BoxContainer.ALIGNMENT_CENTER
	upgrade_list.add_theme_constant_override("separation", 16)
	upgrade_root.add_child(upgrade_list)

	var next_button := Button.new()
	next_button.text = "Start Next Stage"
	next_button.custom_minimum_size = Vector2(220, 44)
	next_button.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	next_button.pressed.connect(_on_next_stage_pressed)
	_style_button(next_button)
	upgrade_root.add_child(next_button)

	# Defeat Panel
	defeat_panel = PanelContainer.new()
	defeat_panel.visible = false
	defeat_panel.custom_minimum_size = Vector2(400, 240)
	defeat_panel.add_theme_stylebox_override("panel", panel_style)
	center_container.add_child(defeat_panel)

	var defeat_root := VBoxContainer.new()
	defeat_root.add_theme_constant_override("separation", 14)
	defeat_panel.add_child(defeat_root)

	var defeat_title := _make_label("DEFEAT", 28)
	defeat_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	defeat_title.add_theme_color_override("font_color", Color(0.95, 0.15, 0.2))
	defeat_root.add_child(defeat_title)

	var defeat_note := _make_label("Your tank was destroyed in battle.", 15)
	defeat_note.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	defeat_root.add_child(defeat_note)

	var retry_button := Button.new()
	retry_button.text = "Retry Stage"
	retry_button.custom_minimum_size = Vector2(0, 44)
	retry_button.pressed.connect(_on_retry_pressed)
	_style_button(retry_button)
	defeat_root.add_child(retry_button)

	var reset_button := Button.new()
	reset_button.text = "Reset Campaign"
	reset_button.custom_minimum_size = Vector2(0, 44)
	reset_button.pressed.connect(_on_reset_pressed)
	_style_button(reset_button)
	defeat_root.add_child(reset_button)

	# --- MAIN MENU PANEL ---
	main_menu_panel = PanelContainer.new()
	main_menu_panel.visible = false
	main_menu_panel.custom_minimum_size = Vector2(480, 450)
	main_menu_panel.add_theme_stylebox_override("panel", panel_style)
	center_container.add_child(main_menu_panel)

	var menu_root := VBoxContainer.new()
	menu_root.add_theme_constant_override("separation", 14)
	main_menu_panel.add_child(menu_root)

	# Neon Title
	var menu_title := Label.new()
	menu_title.text = "GAME WAR"
	menu_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	menu_title.add_theme_font_size_override("font_size", 42)
	menu_title.add_theme_color_override("font_color", Color(0.2, 0.62, 0.95))
	menu_title.add_theme_color_override("font_outline_color", Color(0.05, 0.2, 0.45))
	menu_title.add_theme_constant_override("outline_size", 8)
	menu_root.add_child(menu_title)

	var menu_subtitle := Label.new()
	menu_subtitle.text = "— CYBER BATTLE ARENA —"
	menu_subtitle.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	menu_subtitle.add_theme_font_size_override("font_size", 13)
	menu_subtitle.add_theme_color_override("font_color", Color(0.2, 0.8, 1.0, 0.8))
	menu_root.add_child(menu_subtitle)

	var m_sep1 := HSeparator.new()
	menu_root.add_child(m_sep1)

	# Profile Info Card
	var info_panel := PanelContainer.new()
	var info_style := StyleBoxFlat.new()
	info_style.bg_color = Color(0.12, 0.16, 0.22, 0.75)
	info_style.border_width_left = 1
	info_style.border_width_top = 1
	info_style.border_width_right = 1
	info_style.border_width_bottom = 1
	info_style.border_color = Color(0.2, 0.62, 0.95, 0.45)
	info_style.corner_radius_top_left = 6
	info_style.corner_radius_top_right = 6
	info_style.corner_radius_bottom_left = 6
	info_style.corner_radius_bottom_right = 6
	info_style.content_margin_left = 12
	info_style.content_margin_right = 12
	info_style.content_margin_top = 12
	info_style.content_margin_bottom = 12
	info_panel.add_theme_stylebox_override("panel", info_style)
	menu_root.add_child(info_panel)

	menu_stats_label = Label.new()
	menu_stats_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	menu_stats_label.add_theme_font_size_override("font_size", 14)
	menu_stats_label.add_theme_color_override("font_color", Color(0.9, 0.92, 0.95))
	info_panel.add_child(menu_stats_label)

	# Deploy Button
	menu_battle_btn = Button.new()
	menu_battle_btn.text = "DEPLOY TO BATTLE"
	menu_battle_btn.custom_minimum_size = Vector2(0, 52)
	menu_battle_btn.pressed.connect(_on_menu_battle_pressed)
	_style_button(menu_battle_btn)
	menu_battle_btn.add_theme_color_override("font_color", Color(0.2, 0.95, 0.35))
	menu_root.add_child(menu_battle_btn)

	# Reset Button
	var menu_reset_btn := Button.new()
	menu_reset_btn.text = "RESET CAMPAIGN DATA"
	menu_reset_btn.custom_minimum_size = Vector2(0, 38)
	menu_reset_btn.pressed.connect(_on_menu_reset_pressed)
	_style_button(menu_reset_btn)
	menu_reset_btn.add_theme_color_override("font_color", Color(0.95, 0.2, 0.2))
	menu_root.add_child(menu_reset_btn)

	# Controls Guide panel
	var guide_panel := PanelContainer.new()
	var guide_style := StyleBoxFlat.new()
	guide_style.bg_color = Color(0.1, 0.12, 0.16, 0.5)
	guide_style.corner_radius_top_left = 6
	guide_style.corner_radius_top_right = 6
	guide_style.corner_radius_bottom_left = 6
	guide_style.corner_radius_bottom_right = 6
	guide_style.content_margin_left = 12
	guide_style.content_margin_right = 12
	guide_style.content_margin_top = 8
	guide_style.content_margin_bottom = 8
	guide_panel.add_theme_stylebox_override("panel", guide_style)
	menu_root.add_child(guide_panel)

	var guide_lbl := Label.new()
	guide_lbl.text = "🎮 CONTROLS:\n• Move: WASD / Arrow Keys\n• Aim: Mouse Cursor\n• Shoot: Left Click / Spacebar\n• Mobile: Touch left/right screen halves for Joysticks"
	guide_lbl.add_theme_font_size_override("font_size", 11)
	guide_lbl.add_theme_color_override("font_color", Color(0.7, 0.72, 0.75))
	guide_panel.add_child(guide_lbl)

func _make_label(text_val: String, font_size: int) -> Label:
	var label: Label = Label.new()
	label.text = text_val
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.add_theme_font_size_override("font_size", font_size)
	return label

func _style_button(btn: Button) -> void:
	var style_normal := StyleBoxFlat.new()
	style_normal.bg_color = Color(0.15, 0.2, 0.28, 0.9)
	style_normal.border_width_bottom = 3
	style_normal.border_color = Color(0.1, 0.13, 0.18, 1.0)
	style_normal.corner_radius_top_left = 6
	style_normal.corner_radius_top_right = 6
	style_normal.corner_radius_bottom_left = 6
	style_normal.corner_radius_bottom_right = 6
	style_normal.content_margin_left = 12
	style_normal.content_margin_right = 12
	style_normal.content_margin_top = 8
	style_normal.content_margin_bottom = 8

	var style_hover := style_normal.duplicate() as StyleBoxFlat
	style_hover.bg_color = Color(0.2, 0.28, 0.38, 0.9)
	style_hover.border_color = Color(0.2, 0.62, 0.95, 0.95)

	var style_pressed := style_normal.duplicate() as StyleBoxFlat
	style_pressed.bg_color = Color(0.1, 0.12, 0.18, 0.9)
	style_pressed.border_width_bottom = 1

	btn.add_theme_stylebox_override("normal", style_normal)
	btn.add_theme_stylebox_override("hover", style_hover)
	btn.add_theme_stylebox_override("pressed", style_pressed)
	btn.add_theme_stylebox_override("focus", StyleBoxEmpty.new())
	btn.focus_mode = Control.FOCUS_NONE

func _on_auto_aim_toggled(button_pressed: bool) -> void:
	if button_pressed:
		auto_aim_btn.text = "Auto-Aim: ON"
		auto_aim_btn.add_theme_color_override("font_color", Color(0.2, 0.95, 0.35))
	else:
		auto_aim_btn.text = "Auto-Aim: OFF"
		auto_aim_btn.add_theme_color_override("font_color", Color(0.95, 0.2, 0.2))
	
	if player != null and is_instance_valid(player):
		player.auto_aim = button_pressed

func _spawn_player() -> void:
	if player != null and is_instance_valid(player):
		return
	player = TankEntity.new()
	player.configure(player_stats, "player", PLAYER_COLOR, false, "player")
	player.global_position = Vector2.ZERO
	player.died.connect(_on_player_died)
	world.add_child(player)

func start_stage(stage_index: int) -> void:
	_clear_enemies()
	_clear_obstacles()
	current_stage = GameData.build_stage(stage_index)
	stage_label.text = "Stage: %s" % current_stage["name"]
	status_label.text = "Status: Fighting"
	details_label.text = "Destroy all enemies to unlock upgrades."
	upgrade_panel.visible = false
	defeat_panel.visible = false
	state = State.PLAYING
	spawn_finished = false
	spawn_token += 1
	
	if current_stage.get("boss", false):
		boss_warning_label.visible = true
		boss_warning_timer = 3.0
	else:
		boss_warning_label.visible = false
		boss_warning_timer = 0.0

	_spawn_obstacles(stage_index)
	_spawn_stage_async(spawn_token)
	_refresh_hud()
	_update_player_from_profile()

func _spawn_stage_async(token: int) -> void:
	var waves: Array = []
	if current_stage.has("waves"):
		waves = current_stage["waves"] as Array
	
	var total_waves := waves.size()
	for wave_index in range(total_waves):
		if token != spawn_token:
			return
		
		wave_label.text = "Wave: %d / %d" % [wave_index + 1, total_waves]
		
		var wave: Dictionary = waves[wave_index] as Dictionary
		for i in range(int(wave.get("count", 1))):
			if token != spawn_token:
				return
			_spawn_enemy(wave)
			await get_tree().create_timer(float(wave.get("spawn_interval", 0.5))).timeout
		await get_tree().create_timer(1.2).timeout
		
	if token != spawn_token:
		return
	spawn_finished = true
	_check_stage_clear()

func _spawn_enemy(wave: Dictionary) -> void:
	if player == null:
		return
	var enemy := TankEntity.new()
	var archetype: String = str(wave.get("archetype", "grunt"))
	var stats: Dictionary = GameData.build_enemy_stats(archetype, int(current_stage.get("stage_index", 1)), wave)
	enemy.configure(stats, "enemy", ENEMY_COLORS.get(archetype, Color.WHITE), true, archetype)
	enemy.global_position = _pick_enemy_spawn_position()
	enemy.set_target(player)
	enemy.died.connect(_on_enemy_died)
	active_enemies.append(enemy)
	world.add_child(enemy)

func _pick_enemy_spawn_position() -> Vector2:
	var side: int = randi() % 4
	var half: float = get_arena_half_size() - 60.0
	match side:
		0:
			return Vector2(randf_range(-half, half), -half)
		1:
			return Vector2(randf_range(-half, half), half)
		2:
			return Vector2(-half, randf_range(-half, half))
		_:
			return Vector2(half, randf_range(-half, half))

func _spawn_obstacles(stage_index: int) -> void:
	var count: int = int(clamp(2 + int(stage_index / 2), 2, 6))
	for i in range(count):
		var size: Vector2 = Vector2(90 + (i % 3) * 16, 42 + (i % 2) * 12)
		var offset: Vector2 = Vector2(randf_range(-240, 240), randf_range(-180, 180))
		if abs(offset.x) < 80 and abs(offset.y) < 80:
			offset.x += 140.0
		_create_obstacle(offset, size)

func _create_obstacle(position: Vector2, size: Vector2) -> void:
	var body := StaticBody2D.new()
	body.collision_layer = 4
	body.position = position
	body.z_index = int(position.y)

	var shape_node := CollisionShape2D.new()
	var rect := RectangleShape2D.new()
	rect.size = size
	shape_node.shape = rect
	body.add_child(shape_node)

	var visual := Polygon2D.new()
	visual.polygon = PackedVector2Array([
		Vector2(-size.x * 0.5, -size.y * 0.5),
		Vector2(size.x * 0.5, -size.y * 0.5),
		Vector2(size.x * 0.5, size.y * 0.5),
		Vector2(-size.x * 0.5, size.y * 0.5)
	])
	visual.color = Color(0.14, 0.16, 0.20, 1.0)
	body.add_child(visual)
	
	var border := Line2D.new()
	border.points = PackedVector2Array([
		Vector2(-size.x * 0.5, -size.y * 0.5),
		Vector2(size.x * 0.5, -size.y * 0.5),
		Vector2(size.x * 0.5, size.y * 0.5),
		Vector2(-size.x * 0.5, size.y * 0.5),
		Vector2(-size.x * 0.5, -size.y * 0.5)
	])
	border.width = 2.0
	border.default_color = Color(0.2, 0.62, 0.95, 0.8)
	body.add_child(border)
	
	obstacle_root.add_child(body)

func _create_wall(position: Vector2, size: Vector2) -> void:
	var body := StaticBody2D.new()
	body.collision_layer = 4
	body.position = position
	body.z_index = int(position.y)
	var shape_node := CollisionShape2D.new()
	var rect := RectangleShape2D.new()
	rect.size = size
	shape_node.shape = rect
	body.add_child(shape_node)
	var visual := Polygon2D.new()
	visual.polygon = PackedVector2Array([
		Vector2(-size.x * 0.5, -size.y * 0.5),
		Vector2(size.x * 0.5, -size.y * 0.5),
		Vector2(size.x * 0.5, size.y * 0.5),
		Vector2(-size.x * 0.5, size.y * 0.5)
	])
	visual.color = Color(0.06, 0.08, 0.1, 1.0)
	body.add_child(visual)
	
	var border := Line2D.new()
	border.points = PackedVector2Array([
		Vector2(-size.x * 0.5, -size.y * 0.5),
		Vector2(size.x * 0.5, -size.y * 0.5),
		Vector2(size.x * 0.5, size.y * 0.5),
		Vector2(-size.x * 0.5, size.y * 0.5),
		Vector2(-size.x * 0.5, -size.y * 0.5)
	])
	border.width = 3.0
	border.default_color = Color(0.85, 0.15, 0.25, 0.9)
	body.add_child(border)
	
	world.add_child(body)

func _clear_obstacles() -> void:
	if obstacle_root == null:
		return
	for child in obstacle_root.get_children():
		child.queue_free()

func _clear_enemies() -> void:
	for enemy in active_enemies:
		if is_instance_valid(enemy):
			enemy.queue_free()
	active_enemies.clear()

func _on_enemy_died(entity: Node) -> void:
	active_enemies.erase(entity)
	_check_stage_clear()

func _check_stage_clear() -> void:
	if state != State.PLAYING:
		return
	if spawn_finished and active_enemies.is_empty():
		_on_stage_cleared()

func _on_stage_cleared() -> void:
	state = State.UPGRADE
	status_label.text = "Status: Upgrade phase"
	details_label.text = "Choose a build path or go to the next stage."
	profile["stage_index"] = int(current_stage.get("stage_index", 1)) + 1
	profile["highest_stage"] = max(int(profile.get("highest_stage", 1)), int(current_stage.get("stage_index", 1)))
	profile["coins"] = int(profile.get("coins", 0)) + int(current_stage.get("reward", 0))
	var cleared_stages: Array = profile.get("cleared_stages", []) as Array
	var stage_id := str(current_stage.get("stage_id", ""))
	if not cleared_stages.has(stage_id):
		cleared_stages.append(stage_id)
	profile["cleared_stages"] = cleared_stages
	current_upgrade_choices = GameData.build_upgrade_choices(profile, 3)
	_rebuild_upgrade_panel()
	_update_player_from_profile()
	_refresh_hud()
	SaveSystem.save_profile(profile)
	upgrade_panel.visible = true

func _rebuild_upgrade_panel() -> void:
	for child in upgrade_list.get_children():
		child.queue_free()
		
	var card_style_normal := StyleBoxFlat.new()
	card_style_normal.bg_color = Color(0.15, 0.18, 0.24, 0.95)
	card_style_normal.border_width_left = 2
	card_style_normal.border_width_top = 2
	card_style_normal.border_width_right = 2
	card_style_normal.border_width_bottom = 2
	card_style_normal.border_color = Color(0.25, 0.3, 0.38, 1.0)
	card_style_normal.corner_radius_top_left = 10
	card_style_normal.corner_radius_top_right = 10
	card_style_normal.corner_radius_bottom_left = 10
	card_style_normal.corner_radius_bottom_right = 10
	card_style_normal.content_margin_left = 12
	card_style_normal.content_margin_right = 12
	card_style_normal.content_margin_top = 16
	card_style_normal.content_margin_bottom = 16

	var card_style_hover := card_style_normal.duplicate() as StyleBoxFlat
	card_style_hover.bg_color = Color(0.2, 0.24, 0.32, 0.95)
	card_style_hover.border_color = Color(0.2, 0.62, 0.95, 1.0)
	card_style_hover.shadow_color = Color(0.2, 0.62, 0.95, 0.25)
	card_style_hover.shadow_size = 6

	var card_style_pressed := card_style_normal.duplicate() as StyleBoxFlat
	card_style_pressed.bg_color = Color(0.1, 0.12, 0.18, 0.95)
	card_style_pressed.border_color = Color(0.2, 0.62, 0.95, 0.8)

	for upgrade in current_upgrade_choices:
		var selected_upgrade: Dictionary = upgrade
		var card_btn := Button.new()
		card_btn.custom_minimum_size = Vector2(165, 240)
		card_btn.focus_mode = Control.FOCUS_NONE
		card_btn.add_theme_stylebox_override("normal", card_style_normal)
		card_btn.add_theme_stylebox_override("hover", card_style_hover)
		card_btn.add_theme_stylebox_override("pressed", card_style_pressed)
		
		var card_vbox := VBoxContainer.new()
		card_vbox.mouse_filter = Control.MOUSE_FILTER_IGNORE
		card_vbox.anchor_right = 1.0
		card_vbox.anchor_bottom = 1.0
		card_vbox.add_theme_constant_override("separation", 8)
		card_btn.add_child(card_vbox)
		
		var title_lbl := Label.new()
		title_lbl.text = upgrade["name"]
		title_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		title_lbl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		title_lbl.add_theme_font_size_override("font_size", 16)
		title_lbl.add_theme_color_override("font_color", Color(0.2, 0.8, 1.0))
		card_vbox.add_child(title_lbl)
		
		var cost_lbl := Label.new()
		cost_lbl.text = "💰 %d" % int(upgrade["cost"])
		cost_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		cost_lbl.add_theme_font_size_override("font_size", 14)
		cost_lbl.add_theme_color_override("font_color", Color(0.95, 0.8, 0.1))
		card_vbox.add_child(cost_lbl)
		
		var sep := HSeparator.new()
		card_vbox.add_child(sep)
		
		var desc_lbl := Label.new()
		desc_lbl.text = upgrade["description"]
		desc_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		desc_lbl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		desc_lbl.size_flags_vertical = Control.SIZE_EXPAND_FILL
		desc_lbl.add_theme_font_size_override("font_size", 12)
		card_vbox.add_child(desc_lbl)
		
		card_btn.pressed.connect(func(): _purchase_upgrade(selected_upgrade))
		upgrade_list.add_child(card_btn)

func _purchase_upgrade(upgrade: Dictionary) -> void:
	if state != State.UPGRADE:
		return
	if int(profile.get("coins", 0)) < int(upgrade.get("cost", 0)):
		status_label.text = "Status: Not enough coins"
		if player != null and is_instance_valid(player):
			player._spawn_floating_text("NEED 💰%d" % int(upgrade["cost"]), Color(0.95, 0.2, 0.2))
		return
	var owned: Array = profile.get("unlocked_upgrades", []) as Array
	if owned.has(upgrade.get("id", "")):
		status_label.text = "Status: Upgrade already owned"
		return
	var reqs: Array = upgrade.get("requires", []) as Array
	for req in reqs:
		if not owned.has(req):
			status_label.text = "Status: Requirements not met"
			return
	profile["coins"] = int(profile.get("coins", 0)) - int(upgrade.get("cost", 0))
	owned.append(upgrade.get("id", ""))
	profile["unlocked_upgrades"] = owned
	player_stats = GameData.apply_upgrade(player_stats, upgrade)
	_update_player_from_profile()
	current_upgrade_choices.erase(upgrade)
	_rebuild_upgrade_panel()
	_refresh_hud()
	status_label.text = "Status: Upgrade purchased"
	if player != null and is_instance_valid(player):
		player._spawn_floating_text("UPGRADED!", Color(0.2, 0.95, 0.35))
	SaveSystem.save_profile(profile)

func _update_player_from_profile() -> void:
	if player == null or not is_instance_valid(player):
		_spawn_player()
		if player == null or not is_instance_valid(player):
			return
	player.configure(player_stats, "player", PLAYER_COLOR, false, "player")
	player.global_position = Vector2.ZERO
	player.auto_aim = auto_aim_btn.button_pressed

func _on_next_stage_pressed() -> void:
	if state != State.UPGRADE:
		return
	start_stage(int(profile.get("stage_index", 1)))

func _on_retry_pressed() -> void:
	if state != State.DEFEAT:
		return
	start_stage(max(1, int(profile.get("stage_index", 1))))

func _on_reset_pressed() -> void:
	profile = GameData.default_profile()
	player_stats = GameData.player_base_stats()
	SaveSystem.save_profile(profile)
	_update_player_from_profile()
	_enter_main_menu()

func _enter_main_menu() -> void:
	state = State.MAIN_MENU
	_clear_enemies()
	_clear_obstacles()
	
	upgrade_panel.visible = false
	defeat_panel.visible = false
	top_panel.visible = false
	touch_hint.visible = false
	if left_joystick != null:
		left_joystick.visible = false
	if right_joystick != null:
		right_joystick.visible = false
	
	_spawn_player()
	if player != null and is_instance_valid(player):
		player.global_position = Vector2.ZERO
		player.configure(player_stats, "player", PLAYER_COLOR, false, "player")
		player.velocity = Vector2.ZERO
		player.move_input = Vector2.ZERO
		player.fire_pressed = false
		player.turret_rotation = 0.0
	
	camera.global_position = Vector2.ZERO
	main_menu_panel.visible = true
	_refresh_main_menu()

func _refresh_main_menu() -> void:
	var current_stage_idx: int = int(profile.get("stage_index", 1))
	var highest_stage_idx: int = int(profile.get("highest_stage", 1))
	var coins: int = int(profile.get("coins", 0))
	var unlocked_count: int = (profile.get("unlocked_upgrades", []) as Array).size()
	
	menu_battle_btn.text = "DEPLOY: OPERATION %d" % current_stage_idx
	
	menu_stats_label.text = (
		"★ Profile Intel ★\n" +
		"• Highest Operation: %d\n" +
		"• Earned Coins: 💰 %d\n" +
		"• Unlocked Upgrades: %d / %d" % [highest_stage_idx, coins, unlocked_count, GameData.upgrades().size()]
	)

func _on_menu_battle_pressed() -> void:
	if state != State.MAIN_MENU:
		return
	main_menu_panel.visible = false
	top_panel.visible = true
	touch_hint.visible = true
	
	start_stage(int(profile.get("stage_index", 1)))

func _on_menu_reset_pressed() -> void:
	profile = GameData.default_profile()
	player_stats = GameData.player_base_stats()
	SaveSystem.save_profile(profile)
	_update_player_from_profile()
	if player != null and is_instance_valid(player):
		player.global_position = Vector2.ZERO
	_refresh_main_menu()

func _on_player_died(entity: Node) -> void:
	if state == State.DEFEAT:
		return
	state = State.DEFEAT
	player = null
	spawn_token += 1
	spawn_finished = false
	_clear_enemies()
	status_label.text = "Status: Defeat"
	details_label.text = "Retry or reset the campaign."
	defeat_panel.visible = true
	upgrade_panel.visible = false
	SaveSystem.save_profile(profile)

func _refresh_hud() -> void:
	coin_label.text = "Coins: %d" % int(profile.get("coins", 0))
	if player != null and is_instance_valid(player):
		hp_label.text = "HP: %d/%d" % [int(player.hp), int(player.max_hp)]
	else:
		hp_label.text = "HP: 0/0"
	
	match state:
		State.PLAYING:
			status_label.text = "Status: Fighting"
			status_label.add_theme_color_override("font_color", Color(0.95, 0.85, 0.1))
		State.UPGRADE:
			status_label.text = "Status: Upgrade phase"
			status_label.add_theme_color_override("font_color", Color(0.2, 0.8, 1.0))
		State.DEFEAT:
			status_label.text = "Status: Defeat"
			status_label.add_theme_color_override("font_color", Color(0.95, 0.15, 0.2))
		_:
			status_label.text = "Status: Loading"
			status_label.add_theme_color_override("font_color", Color.WHITE)
			
	if not current_stage.is_empty():
		stage_label.text = "Stage: %s" % current_stage["name"]

func _process(delta: float) -> void:
	if player != null and is_instance_valid(player):
		camera.global_position = camera.global_position.lerp(player.global_position, 0.08)

	# Handle screenshake
	if shake_intensity > 0.0:
		camera.offset = Vector2(
			randf_range(-shake_intensity, shake_intensity),
			randf_range(-shake_intensity, shake_intensity)
		)
		shake_intensity = move_toward(shake_intensity, 0.0, shake_decay * delta)
	else:
		camera.offset = Vector2.ZERO

	# Handle boss warning blink
	if boss_warning_timer > 0.0:
		boss_warning_timer -= delta
		boss_warning_label.modulate.a = 0.4 + 0.6 * abs(sin(Time.get_ticks_msec() * 0.012))
		if boss_warning_timer <= 0.0:
			boss_warning_label.visible = false

	# Desktop keyboard/mouse + Mobile touch processing
	if player != null and is_instance_valid(player):
		if state == State.PLAYING:
			var keyboard_axis := Vector2(
				Input.get_action_strength("ui_right") - Input.get_action_strength("ui_left"),
				Input.get_action_strength("ui_down") - Input.get_action_strength("ui_up")
			)
			
			var final_move := Vector2.ZERO
			if move_touch_index != -1:
				final_move = move_axis
			else:
				final_move = keyboard_axis
				
			var final_aim := Vector2.ZERO
			var final_fire := false
			
			if fire_touch_index != -1:
				final_aim = aim_axis
				final_fire = fire_held
			else:
				var mouse_pos := get_global_mouse_position()
				final_aim = (mouse_pos - player.global_position).normalized()
				final_fire = Input.is_key_pressed(KEY_SPACE) or Input.is_mouse_button_pressed(MOUSE_BUTTON_LEFT)
				
			player.set_player_input(final_move, final_fire, final_aim)
			player.auto_aim = auto_aim_btn.button_pressed
			_refresh_hud()
		elif state == State.MAIN_MENU:
			var mouse_pos := get_global_mouse_position()
			var final_aim = (mouse_pos - player.global_position).normalized()
			player.set_player_input(Vector2.ZERO, false, final_aim)
			
	queue_redraw()

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventScreenTouch:
		var screen_width: float = get_viewport_rect().size.x
		if event.pressed:
			# Left side touch initiates move joystick
			if event.position.x < screen_width * 0.45 and move_touch_index == -1:
				move_touch_index = event.index
				var r: float = float(left_joystick.get("outer_radius"))
				left_joystick.global_position = event.position - Vector2(r, r)
				left_joystick.call("handle_touch_press", left_joystick.get_local_mouse_position(), event.index)
			# Right side touch initiates aim/shoot joystick
			elif event.position.x >= screen_width * 0.55 and fire_touch_index == -1:
				fire_touch_index = event.index
				var r: float = float(right_joystick.get("outer_radius"))
				right_joystick.global_position = event.position - Vector2(r, r)
				right_joystick.call("handle_touch_press", right_joystick.get_local_mouse_position(), event.index)
		else:
			if event.index == move_touch_index:
				move_touch_index = -1
				left_joystick.call("handle_touch_release", event.index)
				move_axis = Vector2.ZERO
			elif event.index == fire_touch_index:
				fire_touch_index = -1
				right_joystick.call("handle_touch_release", event.index)
				aim_axis = Vector2.ZERO
				fire_held = false
				
	elif event is InputEventScreenDrag:
		if event.index == move_touch_index:
			left_joystick.call("handle_touch_drag", event.position - left_joystick.global_position, event.index)
			move_axis = left_joystick.get("output_vector")
		elif event.index == fire_touch_index:
			right_joystick.call("handle_touch_drag", event.position - right_joystick.global_position, event.index)
			aim_axis = right_joystick.get("output_vector")
			fire_held = aim_axis.length() > 0.15

func _draw() -> void:
	# Draw desktop aiming line and reticle
	if state == State.PLAYING and player != null and is_instance_valid(player):
		if move_touch_index == -1 and fire_touch_index == -1:
			var start_pos: Vector2 = player.global_position
			var target_pos: Vector2 = get_global_mouse_position()
			var max_range: float = float(player_stats.get("projectile_range", 1100.0))
			
			var dir: Vector2 = (target_pos - start_pos).normalized()
			var dist: float = min(start_pos.distance_to(target_pos), max_range)
			var end_pos: Vector2 = start_pos + dir * dist
			
			# Draw dotted line
			var dot_spacing: float = 16.0
			var dot_count: int = int(dist / dot_spacing)
			for i in range(1, dot_count):
				var dot_pos: Vector2 = start_pos + dir * (i * dot_spacing)
				draw_circle(dot_pos, 3.0, Color(0.2, 0.62, 0.95, 0.6))
			
			# Draw reticle
			draw_arc(end_pos, 8.0, 0.0, TAU, 16, Color(0.2, 0.62, 0.95, 0.8), 1.5)
			draw_circle(end_pos, 2.0, Color(0.2, 0.62, 0.95, 0.8))

func _find_upgrade_by_id(upgrade_id: String) -> Dictionary:
	for upgrade in GameData.upgrades():
		if upgrade.get("id", "") == upgrade_id:
			return upgrade
	return {}

# --- Floor Grid Inner Class ---
class FloorGrid extends Node2D:
	func _draw() -> void:
		var half := 540.0
		# Draw grid lines
		for x in range(-540, 541, 60):
			draw_line(Vector2(x, -540), Vector2(x, 540), Color(0.16, 0.2, 0.25, 0.35), 1.0)
		for y in range(-540, 541, 60):
			draw_line(Vector2(-540, y), Vector2(540, y), Color(0.16, 0.2, 0.25, 0.35), 1.0)
		# Arena boundary red border
		draw_rect(Rect2(Vector2(-540, -540), Vector2(1080, 1080)), Color(0.95, 0.2, 0.2, 0.25), false, 2.0)
