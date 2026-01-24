export interface Space {
  id: string;
  name: string;
  activeDirPath: string;
  description?: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SpaceSkillMapping {
  spaceId: string;
  skillHash: string;
  isVisible: boolean;
  addedAt: string;
}
