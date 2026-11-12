export type Collection = {
  id: string
  title: string
  tags: string[]
  /** 封面图地址，复用内含素材的缩略图；留空时卡片回退到首幅素材的像素预览。 */
  cover: string
  /** 内含素材 ID，详情页按这个顺序展示。 */
  artworkIds: string[]
}